/**
 * Run the multi-speaker.js first and then run this to append more samples to wavs folder and metadata.txt
 */
'use strict'

import fs from 'fs'
import path from 'path'
import async from 'async'
import {exec} from 'child_process'
import jsb from 'json-beautify'
import { normalizePrompt, normalizeText } from './common_functions.js'

const labelInputFolder = '/Users/janaka/node/tipitaka.lk/dev/audio', // also in '/Volumes/1TB/audio/final uploaded'
    textInputFolder = '/Users/janaka/node/tipitaka.lk/public/static/text',
    fileMapFile = '/Users/janaka/node/tipitaka.lk/public/static/data/file-map.json',
    audioInputFolder = '/Volumes/1TB/audio/silence-added'
const minClipLength = 2, maxClipLength = 24
// TODO: ap- should not have any gatha, force set to para/default - but dhs was 
const forceTypeNoGatha = /^(ap-dhs)/g, excludeFiles = /^ap-yam/

const fileMap = JSON.parse(fs.readFileSync(fileMapFile, 'utf-8'))

function loadLabelFile(file) {
    return fs.readFileSync(path.join(labelInputFolder, file + '.txt'), 'utf-8').split('\n')
        .filter(line => line.trim())
        .map(line => line.trim().split('\t').map(p => Number(p)))
        .map(([start, end, num]) => ({start, end, length: end - start, file, num}))
}

function splitWords(sinhala) { // anything outside sinhala range deleted
    return sinhala.replace(/[^\u0D80-\u0DFF ]/g, '').split(' ').filter(w => w.length)
}
function getMedianWordFrequency(words) {
    const sorted = words.map(w => wordCounts[w]).sort((a, b) => a - b)
    const midI = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[midI] : (sorted[midI - 1] + sorted[midI]) / 2
}
const incCounter = (arr, prop) => arr[prop] = arr[prop] ? arr[prop] + 1 : 1



const wordCounts = {}, dedupList = {}
let totalLabels = 0, totalLength = 0
const usableEntries = []
Object.entries(fileMap).forEach(([textFile, labelFiles]) => {
    if (excludeFiles.test(textFile)) return
    const entries = [], labels = []
    labelFiles.forEach(lf => labels.push(...loadLabelFile(lf)))
    JSON.parse(fs.readFileSync(path.join(textInputFolder, textFile + '.json'), 'utf-8')).pages.forEach(page => entries.push(...page.pali.entries))
    
    // join labels with entries, leaving only entries with labels
    let labeled = entries.filter(entry => !entry.noAudio)
    labeled.forEach((e, i) => {
            e.label = labels[i]
            e.textFile = textFile
    })
    labeled = labeled.filter(e => e.label) // some text files could be only partially recorded

    if (forceTypeNoGatha.test(textFile)) labeled.forEach(e => e.type = (e.type == 'gatha') ? 'paragraph' : e.type)

    // get only the labels of length within desired range
    let usable = labeled.filter((e, i) => e.label && e.label.length > minClipLength && e.label.length <= maxClipLength)
    usable.forEach(e => {
        const text = normalizeText(e.text, e.type)
        e = Object.assign(e, normalizePrompt(text, e.type))
        e.words = splitWords(e.sinhala)
    })

    usable = usable.filter(e => { // remove any text that occured before
        const key = e.words.join(' ')
        if (dedupList[key]) return false
        for (let word of e.words) incCounter(wordCounts, word) // give higher prob to rare words
        return dedupList[key] = true
    })

    totalLength += labeled.reduce((acc, e) => acc + e.label.length, 0)
    totalLabels += labeled.length
    
    console.log(`file: ${textFile}, all labels: ${labeled.length}, usable labels: ${usable.length}`)
    usableEntries.push(...usable)
})

// remove outliers and sort usable entries based on a score
usableEntries.forEach(e => {
    e.score = getMedianWordFrequency(e.words)
    e.lengthRatio = e.label.length / e.roman.replace(/h/g, '').length
})
const outliersToRemove = 200
const outlierRemoved = usableEntries.sort((a, b) => a.lengthRatio - b.lengthRatio).slice(outliersToRemove, -outliersToRemove)
outlierRemoved.sort((a, b) => a.score - b.score) // ascending order of the score
const outlierLength = outlierRemoved.reduce((acc, e) => acc + e.label.length, 0)

const requiredLength = 30 * 3600,  // collect until this many hours are reached
    wavFileOffset = 1000, // allow 1000 from the multi-speaker.js
    maxAllowed = { gatha: 0.2, centered: 0.05, heading: 0.1 } // otherwise too many gatha/headings will be selected since they are the short entries
let collectedLength = 0, collectedCount = { total: 0, }
const canCollect = (type) => (maxAllowed[type] || 1) > (collectedCount[type] || 0) / (collectedCount.total || 1)

const usedEntries = outlierRemoved.filter((e, i) => {
    if (!canCollect(e.type) || collectedLength > requiredLength) return false
    collectedLength += e.label.length
    collectedCount[e.type] = (collectedCount[e.type] || 0) + 1
    collectedCount.total++
    return true
})
usedEntries.sort((a, b) => a.lengthRatio - b.lengthRatio).forEach((e, i) => e.wavFile = 'pali_' + (i + wavFileOffset).toString().padStart(4, '0'))

const extractAudio = true
if (extractAudio) {
    // extract content from audio files
    // trim all silences more than 0.75 seconds, normalize and set rate (original flac is 44100)
    const outputFolder = 'wavs', outputOptions = 'silence -l 1 0.1 1% -1 0.75 1% reverse silence 1 0.1 1% reverse rate 22050 norm -1' //rate 22050 before norm
    // do not delete output folder since we have to append to existing samples from multi-speaker

    const extractSegment = (e, callback) => { // Define the function that will extract a single segment
        const inputFile = path.join(audioInputFolder, e.label.file + '.flac')
        const command = `sox "${inputFile}" "${path.join(outputFolder, e.wavFile + '.wav')}" trim ${e.label.start} ${e.label.length.toFixed(2)} ${outputOptions}`;
        exec(command, callback);
    }
    const startTime = new Date()
    async.mapLimit(usedEntries, 7, (e, mapCallback) => {
            extractSegment(e, (error, stdout, stderr) => mapCallback(error || null, stderr || stdout))
        }, (error, results) => {
            if (error) console.error(error)
            console.log(`Extracted audio from flac files in ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
        })
}

// compute character and type counts
const charCountsRoman = {}, charCountsSinhala = {}, typeCounts = {}
usedEntries.forEach(e => {
    for (let char of e.roman) incCounter(charCountsRoman, char)
    for (let char of e.sinhala) incCounter(charCountsSinhala, char)
    incCounter(typeCounts, e.type)
    e.speaker = 'mettananda' // (e.type == 'gatha') ? 'gatha' : 'default'
})
const usedLength = usedEntries.reduce((acc, e) => acc + e.label.length, 0)

if (extractAudio) {
    fs.writeFileSync('char-counts.tsv', Object.entries(charCountsRoman)
        .sort((a, b) => b[1] - a[1])
        .map(([char, count]) => char + '\t' + count)
        .join('\n'), 'utf-8')
    fs.appendFileSync('metadata.csv', '\n' + usedEntries.map(e => [e.wavFile, e.roman, e.sinhala, e.speaker, e.type].join('|')).join('\n'), 'utf8')
    fs.writeFileSync('word-counts.tsv', Object.entries(wordCounts).map(([word, count]) => word + '\t' + count).join('\n'), 'utf-8')
    fs.writeFileSync('text-entries.json', jsb(usedEntries, null, '\t', 100), 'utf-8')
}

console.log(`Max clip length: ${maxClipLength} seconds. Min clip length: ${minClipLength} seconds`)
const log = (stat, count, duration) => console.log(`${stat} labels => count: ${count}, length: ${(duration / 3600).toFixed(1)} hours, average length: ${(duration / count).toFixed(2)}`)
log('Total', totalLabels, totalLength)
log('Usable', outlierRemoved.length, outlierLength)
log('Used', usedEntries.length, usedLength)
console.log(typeCounts)
console.log(`characters="${Object.keys(charCountsRoman).sort().join('')}"`)
console.log(`characters="${Object.keys(charCountsSinhala).sort().join('')}"`)
console.log(`create dataset using "tar -cjf pali_dataset.tar.bz2 wavs metadata.csv"`)