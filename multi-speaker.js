'use strict'

import fs from 'fs'
import path from 'path'
import async from 'async'
import {exec} from 'child_process'
import jsb from 'json-beautify'
import { normalizePrompt, normalizeText } from './common_functions.js'

const audioInputFolder = 'originals', promptsInputFolder = 'originals'
const minClipLength = 1, maxClipLength = 17 // incase trimmed by the sox command

function loadLabelFile(file) {
    return fs.readFileSync(path.join(audioInputFolder, file + '.txt'), 'utf-8').split('\n')
        .filter(line => line.trim())
        .map(line => line.trim().split('\t').map(p => Number(p)))
        .map(([start, end, index]) => ({start, end, length: end - start, file, index}))
}

function loadPrompts(speaker) {
    return fs.readFileSync(path.join(promptsInputFolder, `${speaker}-prompts.txt`), 'utf-8').split('\n\n').map(group => {
        const lines = group.split('\n')
        const [number, type, source] = lines[0].split('\t')
        return {text: lines.slice(1).join('\n'), index: Number(number), type, source}
    })
}
const incCounter = (arr, prop) => arr[prop] = (arr[prop] || 0) + 1
const totalDuration = (entries) => entries.reduce((acc, e) => acc + e.length, 0)

function loadSpeaker(speaker, indexOffset) {
    const prompts = loadPrompts(speaker), entries = []
    // read the directory and parse the file names
    fs.readdirSync(audioInputFolder).filter(f => f.endsWith(`.flac`) && f.startsWith(speaker)).map(f => {
        const parts = f.match(/^(.+?)-(\d+)-(\d+)\.flac$/)
        if (!parts || parts[1] != speaker) console.error(`malformed file name ${f}`)
        const [startI, endI] = parts.slice(2, 4).map(p => Number(p))
        const file = f.slice(0, -5), labels = loadLabelFile(file)
        if (startI != labels[0].index || (endI - startI + 1) != labels.length) console.error(`malformed labels for file ${f}`)
        console.log(`process ${f} with ${labels.length} labels`)
        return {startI, endI, speaker, file, labels, prompts: prompts.slice(startI - 1, endI)}
    }).sort((a, b) => a.startI - b.startI)
    .forEach(g => {
        g.labels.forEach(({start, end, length, index}, i) => {
            const prompt = g.prompts[i]
            if (index != prompt.index) console.error(`prompt index ${prompt.index} does not match the label index ${index}`)
            const {sinhala, roman} = normalizePrompt(prompt.text, prompt.type), audioInd = index + indexOffset, lengthRatio = length / roman.replace(/h/g, '').length
            entries.push({ audioInd, roman, sinhala, speaker: g.speaker, start, end, length, 
                lengthRatio, file: g.file, wavFile: `sinh_${String(audioInd).padStart(4, '0')}` })
        })
    })
    console.log(`total ${entries.length} labels loaded for speaker ${speaker}`)
    return entries
}

const entries = []
entries.push(...loadSpeaker('wdevananda', 0))
entries.push(...loadSpeaker('oshadir', entries.length))
entries.push(...loadSpeaker('obhasa', entries.length))
entries.push(...loadSpeaker('lankananda', entries.length))

const outliersToRemove = 25
const outlierRemoved = entries.sort((a, b) => a.lengthRatio - b.lengthRatio).slice(outliersToRemove, -outliersToRemove)
const usedEntries = outlierRemoved.filter(({length}) => length <= maxClipLength && length >= minClipLength).sort((a, b) => a.audioInd - b.audioInd)

// extract content from audio files
// trim all silences more than 0.75 seconds, normalize and set rate (original flac is 44100)
// silence -l 1 0.1 0.2% -1 0.75 0.2% reverse silence 1 0.1 0.2% reverse
const extractAudio = true
if (extractAudio) {
    const outputFolder = 'wavs', outputOptions = 'rate 22050 norm -1' //rate 22050 before norm
    fs.rmSync(outputFolder, {recursive: true})
    fs.mkdirSync(outputFolder)
    
    const extractSegment = (e, callback) => { // Define the function that will extract a single segment
        const inputFile = path.join(audioInputFolder, e.file + '.flac')
        const command = `sox "${inputFile}" "${path.join(outputFolder, e.wavFile + '.wav')}" trim ${e.start} ${e.length.toFixed(2)} ${outputOptions}`;
        exec(command, callback);
    }
    const startTime = Date.now()
    async.mapLimit(usedEntries, 7, (e, mapCallback) => {
            extractSegment(e, (error, stdout, stderr) => mapCallback(error || null, stderr || stdout))
        }, (error, results) => {
            if (error) console.error(error)
            console.log(`Extracted audio from flac files in ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
        })
}

// compute character and type counts
const charCountsRoman = {}, charCountsSinhala = {}, speakerCounts = {}
usedEntries.forEach(e => {
    for (let char of e.roman) incCounter(charCountsRoman, char)
    for (let char of e.sinhala) incCounter(charCountsSinhala, char)
    incCounter(speakerCounts, e.speaker)
})

// fs.writeFileSync('char-counts.tsv', Object.entries(charCountsRoman)
//     .sort((a, b) => b[1] - a[1])
//     .map(([char, count]) => char + '\t' + count)
//     .join('\n'), 'utf-8')

fs.writeFileSync('metadata.csv', usedEntries.map(e => [e.wavFile, e.roman, e.sinhala, e.speaker].join('|')).join('\n'), 'utf8')

// logging stats
const log = (stat, count, duration) => console.log(`${stat} labels => count: ${count}, length: ${(duration / 3600).toFixed(1)} hours, average length: ${(duration / count).toFixed(2)}`)
log('Total', entries.length, totalDuration(entries))
log('Outliers', outlierRemoved.length, totalDuration(outlierRemoved))
log('Used', usedEntries.length, totalDuration(usedEntries))
console.log(`characters="${Object.keys(charCountsRoman).sort().join('')}"`)
console.log(`characters="${Object.keys(charCountsSinhala).sort().join('')}"`)
console.log(`speakers=${JSON.stringify(speakerCounts)}`)
console.log(`run the create-dataset.js next to extract from tipitaka.lk`)
// '(),-.:;?xංඅආඉඊඋඌඑඔකඛගඝඞචඡජඣඤටඨඩඪණතථදධනපඵබභමයරලවසහළ්ාිීුූෙො"
// '(),-.:;?xංඅආඉඊඋඌඑඔකඛගඝඞචඡජඣඤටඨඩඪණතථදධනපඵබභමයරලවසහළ්ාිීුූෙො"