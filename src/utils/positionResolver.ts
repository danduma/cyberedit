export function mapTextRangeToDocRange(doc: any, start: number, length: number) {
    // Very naive implementation
    return { start: start + 1, end: start + length + 1 };
}


