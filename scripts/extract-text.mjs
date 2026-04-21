import fs from "fs";
import PizZip from "pizzip";

const content = fs.readFileSync("reference-template.docx");
const zip = new PizZip(content);
const xml = zip.file("word/document.xml").asText();

// Extract all text runs to understand content positions
const textRegex = /<w:t[^>]*>(.*?)<\/w:t>/g;
let match;
let i = 0;
while ((match = textRegex.exec(xml)) !== null) {
  if (match[1].trim()) {
    console.log(`${i}: "${match[1]}"`);
  }
  i++;
}
