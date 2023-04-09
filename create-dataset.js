'use strict'

import fs from 'fs'
import path from 'path'
import async from 'async'
import {exec} from 'child_process'
import jsb from 'json-beautify'
import {sinhalaToRomanConvert} from '@pnfo/singlish-search/roman_convert.js'

const labelInputFolder = '/Users/janaka/node/tipitaka.lk/public/audio', // also in '/Volumes/1TB/audio/final uploaded'
    textInputFolder = '/Users/janaka/node/tipitaka.lk/public/static/text',
    audioInputFolder = '/Volumes/1TB/audio/silence-added'
const minClipLength = 3, maxClipLength = 18

const fileMap = JSON.parse(fs.readFileSync(path.join(labelInputFolder, 'file-map.json'), 'utf-8'))

function loadLabelFile(file) {
    return fs.readFileSync(path.join(labelInputFolder, file + '.txt'), 'utf-8').split('\n')
        .filter(line => line.trim())
        .map(line => line.trim().split('\t').map(p => Number(p)))
        .map(([start, end, num]) => ({start, end, length: end - start, file, num}))
}

function normalizePrompt(ptext) {
    ptext = ptext.replace(/[\[\{]/g, '(') // only the normal bracket is supported
    ptext = ptext.replace(/[\]\}]/g, ')')
    ptext = ptext.replace(/["“”‘’]/g, "'") // all quotes to single straight quotes
    ptext = ptext.replace(/\s+/g, ' ').trim() // collapse whitespace
    const sinhala = ptext.replace(/\u200d/g, '') // remove yansa, rakar, bandi
    const roman = sinhalaToRomanConvert(sinhala)
    return {sinhala, roman}
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

    // get only the labels of length within desired range
    let usable = labeled.filter((e, i) => e.label && e.label.length > minClipLength && e.label.length <= maxClipLength)
    usable.forEach(e => {
        let text = e.text.replace(/\*\*|__|\{\S+?\}/g, '') // remove bold, underline and footnotes
        text = text.replace(/ ?-පෙ-/g, '.') // -pe- is not pronounced
        text = text.replace(/^-පෙ-/g, '') // beginning with -pe- removed
        text = text.replace(/[-–—]+/g, '-')
        text = text.replace(/\.+/g, '.')
        text = text.replace(/\d+[-\.,]?/g, '') // numbers mostly at the beginning of entries
        text = text.replace(/\n/g, e.type == 'gatha' ? ' x ' : ' # ') // newlines cause issues in displaying text 
        e = Object.assign(e, normalizePrompt(text))
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
const outlierRemoved = usableEntries.sort((a, b) => a.lengthRatio - b.lengthRatio).slice(10, -10)
outlierRemoved.sort((a, b) => a.score - b.score) // ascending order of the score
const outlierLength = outlierRemoved.reduce((acc, e) => acc + e.label.length, 0)

const requiredLength = 2 * 3600  // collect until this many hours are reached
let collectedLength = 0
const usedEntries = outlierRemoved.filter((e, i) => {
    collectedLength += e.label.length
    e.wavFile = 'pali_' + (i + 1).toString().padStart(4, '0')
    return collectedLength <= requiredLength
})
usedEntries.sort((a, b) => a.lengthRatio - b.lengthRatio)

// extract content from audio files
const outputFolder = 'wavs', outputOptions = 'norm -1 rate 22050' // normalize and set rate (original flac is 44100)
fs.rmSync(outputFolder, {recursive: true})
fs.mkdirSync(outputFolder)
// Define the function that will extract a single segment
const extractSegment = (e, callback) => {
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


// compute character and type counts
const charCounts = {}, typeCounts = {}
usedEntries.forEach(e => {
    for (let char of e.roman) incCounter(charCounts, char)
    incCounter(typeCounts, e.type)
})
const usedLength = usedEntries.reduce((acc, e) => acc + e.label.length, 0)

fs.writeFileSync('char-counts.tsv', Object.entries(charCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([char, count]) => char + '\t' + count)
    .join('\n'), 'utf-8')
fs.writeFileSync('metadata.csv', usedEntries.map(e => [e.wavFile, e.sinhala, e.roman].join('|')).join('\n'), 'utf8')
//fs.writeFileSync('word-counts.tsv', Object.entries(wordCounts).map(([word, count]) => word + '\t' + count).join('\n'), 'utf-8')
fs.writeFileSync('text-entries.json', jsb(usedEntries, null, '\t', 100), 'utf-8')

const log = (stat, count, duration) => console.log(`${stat} labels => count: ${count}, length: ${(duration / 3600).toFixed(1)} hours, average length: ${(duration / count).toFixed(2)}`)
log('Total', totalLabels, totalLength)
log('Usable', outlierRemoved.length, outlierLength)
log('Used', usedEntries.length, usedLength)
console.log(typeCounts)
console.log(`create dataset using "tar -cjf pali_dataset.tar.bz2 wavs metadata.csv"`)