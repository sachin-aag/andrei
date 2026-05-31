import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";

function minimalDocxWithComment(): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>` +
      `</Types>`
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );
  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>` +
      `</Relationships>`
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
      `<w:p><w:r><w:t>Define</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>The </w:t></w:r>` +
      `<w:commentRangeStart w:id="0"/>` +
      `<w:r><w:t>critical deviation</w:t></w:r>` +
      `<w:commentRangeEnd w:id="0"/>` +
      `<w:r><w:commentReference w:id="0"/></w:r>` +
      `<w:r><w:t> was observed.</w:t></w:r></w:p>` +
      `</w:body></w:document>`
  );
  zip.folder("word")?.file(
    "comments.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:comment w:id="0" w:author="External Reviewer" w:initials="ER" w:date="2026-01-02T03:04:05Z">` +
      `<w:p><w:r><w:t>Please clarify this deviation.</w:t></w:r></w:p>` +
      `</w:comment>` +
      `</w:comments>`
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function minimalDocxWithDuplicateAnchorComments(): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>` +
      `</Types>`
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );
  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>` +
      `</Relationships>`
  );
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>` +
      `<w:p><w:r><w:t>Define</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>The </w:t></w:r>` +
      `<w:commentRangeStart w:id="0"/>` +
      `<w:commentRangeStart w:id="1"/>` +
      `<w:r><w:t>same reviewed sentence</w:t></w:r>` +
      `<w:commentRangeEnd w:id="1"/>` +
      `<w:commentRangeEnd w:id="0"/>` +
      `<w:r><w:commentReference w:id="0"/></w:r>` +
      `<w:r><w:commentReference w:id="1"/></w:r>` +
      `<w:r><w:t> stays in the paragraph.</w:t></w:r></w:p>` +
      `</w:body></w:document>`
  );
  zip.folder("word")?.file(
    "comments.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:comment w:id="0" w:author="External Reviewer" w:initials="ER" w:date="2026-01-02T03:04:05Z">` +
      `<w:p><w:r><w:t>Primary comment.</w:t></w:r></w:p>` +
      `</w:comment>` +
      `<w:comment w:id="1" w:author="Second Reviewer" w:initials="SR" w:date="2026-01-02T03:05:05Z">` +
      `<w:p><w:r><w:t>Reply on same anchor.</w:t></w:r></w:p>` +
      `</w:comment>` +
      `</w:comments>`
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("Word comment import", () => {
  it("imports Word comments as locked external comment drafts with best-effort inline anchors", async () => {
    const imported = await docxBufferToImportedReportContent(minimalDocxWithComment());

    expect(imported.comments).toHaveLength(1);
    expect(imported.comments[0]).toMatchObject({
      externalCommentId: "0",
      externalAuthorName: "External Reviewer",
      externalAuthorInitials: "ER",
      content: "Please clarify this deviation.",
      anchorText: "critical deviation",
      section: "define",
      contentPath: "narrative",
    });
    expect(imported.comments[0]?.fromPos).toBe(5);
    expect(imported.comments[0]?.toPos).toBe(23);
  });

  it("groups imported comments with the same Word anchor as one thread when reply metadata is missing", async () => {
    const imported = await docxBufferToImportedReportContent(
      minimalDocxWithDuplicateAnchorComments()
    );

    expect(imported.comments).toHaveLength(2);
    expect(imported.comments[0]).toMatchObject({
      externalCommentId: "0",
      parentExternalCommentId: null,
      anchorText: "same reviewed sentence",
      contentPath: "narrative",
      fromPos: 5,
      toPos: 27,
    });
    expect(imported.comments[1]).toMatchObject({
      externalCommentId: "1",
      parentExternalCommentId: "0",
      anchorText: "same reviewed sentence",
      contentPath: null,
      fromPos: null,
      toPos: null,
    });
  });
});
