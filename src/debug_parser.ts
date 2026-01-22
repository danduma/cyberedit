
import { parseMarkdownToProseMirror } from './services/markdownService';

const markdown = `
## BPC-157 {.infobox .infobox-right}

![BPC-157 Structure](/path/to/structure.png "Pentadecapeptide Structure")

| Label | Value |
| --- | --- |
| Sequence | Gly-Glu-Pro-Pro-Pro... |
| Category | Repair Peptide |

## Practical FAQ {.faq-section}

### How long does it take for BPC-157 to work? {.faq-item}

Typical timelines show acute GH pulse within 30 min.

## Evidence Summary Table (Human Effect Matrix)

| Outcome | Effect | Quality | Consistency |
| --- | --- | --- | --- |
| Tendon Healing | ↑↑↑ (p) | High | High |
| Pain Reduction | ↑ (p) | Low | Moderate |
{.evidence-table}

Inline tags: IGF-1{.tag-biomarker}
`;

try {
    console.log("Attempting to parse complex markdown...");
    const doc = parseMarkdownToProseMirror(markdown);
    console.log("Parse successful!");
    // console.log(JSON.stringify(doc.toJSON(), null, 2));
} catch (error) {
    console.error("Caught error during parsing:");
    console.error(error);
}
