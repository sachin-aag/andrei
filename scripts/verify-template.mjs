import fs from "fs";
import PizZip from "pizzip";

const content = fs.readFileSync("templates/investigation-report-template.docx");
const zip = new PizZip(content);
const xml = zip.file("word/document.xml").asText();

// Extract all text
const textRegex = /<w:t[^>]*>(.*?)<\/w:t>/g;
let match;
const allText = [];
while ((match = textRegex.exec(xml)) !== null) {
  if (match[1].trim()) {
    allText.push(match[1]);
  }
}

console.log("=== All text in generated template ===");
allText.forEach((t, i) => {
  console.log(`${i}: ${t}`);
});

// Check for placeholder tags
console.log("\n=== Placeholder tags found ===");
const placeholders = allText.filter(t => t.includes("{") || t.includes("}"));
placeholders.forEach(p => console.log(`  ${p}`));

// Check for remaining content that should have been replaced
console.log("\n=== Potential unreplaced content (long text snippets) ===");
allText.filter(t => t.length > 50 && !t.includes("{") && !t.startsWith("<")).forEach(t => {
  console.log(`  "${t.substring(0, 80)}..."`);
});
