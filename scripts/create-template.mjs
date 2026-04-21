import fs from "fs";
import PizZip from "pizzip";

const content = fs.readFileSync(
  "/Users/sachinagrawal/andrei/andrei_v2/reference-template.docx"
);
const zip = new PizZip(content);

// List all files in the docx archive
console.log("=== Files in the .docx archive ===");
for (const filename of Object.keys(zip.files)) {
  console.log(filename);
}

console.log("\n=== word/document.xml ===\n");
const documentXml = zip.file("word/document.xml").asText();
console.log(documentXml);

// Also print headers/footers if they exist
for (const extra of ["word/header1.xml", "word/header2.xml", "word/header3.xml", "word/footer1.xml", "word/footer2.xml", "word/footer3.xml"]) {
  const f = zip.file(extra);
  if (f) {
    console.log(`\n=== ${extra} ===\n`);
    console.log(f.asText());
  }
}
