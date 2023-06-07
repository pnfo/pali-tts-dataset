/*
get the syllables list from the bjt list of words
split all the paragraphs longer than given length to sentences and discard any longer than a given length
only add a sentence to the selected list only if it adds a some syllables not already in the selected list
*/
import fs from 'fs'
import path from 'path'
import { normalizeText } from './common_functions.js';
import {sinhalaToRomanConvert} from '@pnfo/singlish-search/roman_convert.js'
import jsb from 'json-beautify'
import lodash from 'lodash'

const alPat = '(?:[ක-ෆ]\u0dca(?:[රයව][ා-ො]?)?)';
// basic - has the kaka issue - where the second ka is pronaunced differently
const s1Regex = new RegExp(`(?:[ක-ෆ]|[අආඉඊඋඌඑඔ])[ා-ො]?(${alPat}|ං)*`, 'g');
// capture successive consos without following vowels in the same match
//const s2Regex = new RegExp(`(?:[ක-ෆ]|[අආඉඊඋඌඑඔ])([ක-ෆ]+(?![ා-ො\u0DCA])|[ා-ො])?(${alPat}|ං)*`, 'g');
const startReg = new RegExp(`^${alPat}+ං?`);

function breakSyllables(word) {
    let match, syls = {}
    const word2 = word.replace(startReg, (m) => {
        syls[m] = 1;
        return '';
    });
    while ((match = s1Regex.exec(word2)) !== null) { // get all the matches
        syls[match[0]] = (syls[match[0]] || 0) + 1;
    }
    return Object.entries(syls);
}

function extractPrompts(entries, file) {
    const prompts = []
    entries.forEach(({text, type}) => {
        if (text.length < maxPromptLength) {
            prompts.push({text, type})
        } else {
            prompts.push(...text.split('.').map(p => ({text: p.trim() + '.', type}))
                .filter(({text}) => text.length > minSplitPromptLength && text.length < maxPromptLength))
        }
    })

    lodash.shuffle(prompts).forEach(({type, text}) => {
        if (selected[text] || selectedFiles[file] >= maxPromptsPerFile) return
        text = normalizeText(text, type)
        const syls = breakSyllables(text)
        const newSyls = syls.filter(([s, c]) => !selectedSyls[s])
        if (newSyls.length >= 4 && syls.length >= 20) {
            selected[text] = {type, newSyls: newSyls.length, length: text.length, file}
            syls.forEach(([s, c]) => selectedSyls[s] = (selectedSyls[s] || 0) + c) // add to selected syls
            countSelected++
            timeSelecetd += text.length * textLengthToTimeRatio
            selectedFiles[file] = (selectedFiles[file] || 0) + 1
            selectedTypes[type] = (selectedTypes[type] || 0) + 1
        }
    })
    promptsConsidered += prompts.length
    entriesConsidered += entries.length
}

const minSplitPromptLength = 40, maxTimeNeeded = 3600, textLengthToTimeRatio = 0.144, 
    maxPromptLength = 18 / textLengthToTimeRatio, maxPromptsPerFile = 4,
    textInputFolder = '/Users/janaka/node/tipitaka.lk/public/static/text', datasetName = 'shivani'
const selected = {}, selectedSyls = {}, selectedFiles = {}, selectedTypes = {}
let countSelected = 0, timeSelecetd = 0, filesUsed = 0, promptsConsidered = 0, entriesConsidered = 0
const files = fs.readdirSync(textInputFolder).filter(f => f.endsWith('json') && !f.startsWith('atta'))
lodash.shuffle(files).forEach(file => {
    if (timeSelecetd > maxTimeNeeded) return
    const entries = JSON.parse(fs.readFileSync(path.join(textInputFolder, file), 'utf-8')).pages.map(page => page.pali.entries).flat()
    extractPrompts(entries, file)
    filesUsed++
    console.log(`${countSelected} prompts with length ${Math.round(timeSelecetd)}. processed ${file}.`)
})

fs.writeFileSync(`syl-prompts/info-${datasetName}.json`, jsb(selected, null, '\t', 100), 'utf-8')
//fs.writeFileSync(`syl-prompts/syls-${datasetName}.json`, jsb(selectedSyls, null, '\t', 100), 'utf-8')
fs.writeFileSync(`syl-prompts/prompts-${datasetName}.txt`, Object.entries(selected)
    .sort((a, b) => a[1].type.localeCompare(b[1].type))
    .map(([text, {type, file}], i) => `${i + 1}\t${type}\t${file.slice(0, -5)}\n${text.replace(/ x /g, '\n')}`).join('\n\n'), 'utf-8')
fs.writeFileSync(`syl-prompts/prompts-en-${datasetName}.txt`, Object.entries(selected).map(
     ([text, {type, file}], i) => `${i + 1}\t${type}\t${file.slice(0, -5)}\n${sinhalaToRomanConvert(text.replace(/ x /g, '\n'))}`).join('\n\n'), 'utf-8')
console.log(`number of final syllables ${Object.keys(selectedSyls).length}, files used ${filesUsed}`)
console.log(`prompts considered ${promptsConsidered}, entries considered ${entriesConsidered}`)
console.log(selectedTypes)
