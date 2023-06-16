
import {sinhalaToRomanConvert} from '@pnfo/singlish-search/roman_convert.js'
import fs from 'fs'

export function normalizeText(text, type) {
    text = text.replace(/\*\*|__|\{\S+?\}/g, '') // remove bold, underline and footnotes
    text = text.replace(/ ?-පෙ-/g, '.') // -pe- is not pronounced
    text = text.replace(/^-පෙ-/g, '') // beginning with -pe- removed
    text = text.replace(/[-–—]+/g, '-')
    text = text.replace(/\.+/g, '.')
    text = text.replace(/\d+[-\.,]?/g, '') // numbers mostly at the beginning of entries
    text = text.replace(/\(\s?\)/g, ' ') // remove empty brackets
    // if a speaker encoding is used to denote various chanting styles, remove the type checks below
    text = text.replace(/\n/g, type == 'gatha' ? ' x ' : ' # ') // newlines cause issues in displaying text
    //if (e.type == 'heading') text = text + '~' // headings are long chanted at the end. use ~ for longing
    return text.trim()
}

export function normalizePrompt(ptext) {
    ptext = ptext.replace(/[\[\{\(]\s?/g, '(') // only the normal bracket is supported
    ptext = ptext.replace(/\s?[\]\}\)]/g, ')')
    ptext = ptext.replace(/["“”‘’]/g, "'") // all quotes to single straight quotes
    ptext = ptext.replace(/\s+/g, ' ').trim() // collapse whitespace
    const sinhala = ptext.replace(/\u200d/g, '') // remove yansa, rakar, bandi
    const roman = sinhalaToRomanConvert(sinhala)
    return {sinhala, roman}
}

export function loadPrompts(file) {
    const groups = fs.readFileSync(file, 'utf-8').split('\n\n'), prompts = {}
    groups.forEach(group => {
        const lines = group.split('\n')
        const [index, type, file] = lines[0]
        prompts[lines.slice(1).join('\n')] = {index, type, file}
    })
    return prompts
}

function comparePromptLists(file1, file2) {
    const texts1 = Object.keys(JSON.parse(fs.readFileSync(file1)))
    const texts2 = Object.keys(JSON.parse(fs.readFileSync(file2)))
    const inBoth = texts1.filter(t => texts2.includes(t))
    console.log(`file1: ${texts1.length}, file2: ${texts2.length}, in both: ${inBoth.length}`)
    console.log(inBoth)
}

//comparePromptLists('syl-prompts/info-naitissa.json', 'syl-prompts/info-dhammagaru.json')
//comparePromptLists('sinhala-prompts/syls-syl-1.json', 'sinhala-prompts/syls-syl-3.json')