/**
 * ocr.ts — read a receipt photo, on the phone.
 *
 * Tesseract compiled to wasm, running in a worker in the browser. The core and
 * the language data are SERVED FROM THIS SITE rather than a CDN, so once the
 * app has been opened the whole thing works with no network at all — which is
 * the entire point. About 5.7MB on first use, then cached by the browser.
 *
 * TWO PASSES, because no single page-segmentation mode gets everything off a
 * till receipt:
 *   psm 6 reads the item lines whole (name, barcode, flag, price) but loses
 *         the big "# ITEMS SOLD n" line near the bottom.
 *   psm 4 finds that line, but treats the price column separately and drops
 *         the item prices altogether.
 * So the body comes from psm 6 and the count is fetched from psm 4 only when
 * psm 6 missed it. The count is worth a second pass: it is the one line that
 * can tell you the OCR dropped an item.
 */
import { createWorker } from 'tesseract.js'
import { itemsSold } from './receipts'

const BASE = `${import.meta.env.BASE_URL}tesseract/`

export interface OcrProgress {
  (stage: string, fraction: number): void
}

export async function readReceipt(
  image: File | Blob | string,
  onProgress?: OcrProgress,
): Promise<string> {
  onProgress?.('starting', 0.02)
  const worker = await createWorker('eng', 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: BASE,
    langPath: BASE,
    // The bundled language file is gzipped; without this it looks for a
    // plain .traineddata and 404s.
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.('reading', 0.1 + m.progress * 0.75)
      else onProgress?.(m.status, 0.05)
    },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never })
    let text = (await worker.recognize(image)).data.text

    if (!itemsSold(text)) {
      onProgress?.('checking the count', 0.9)
      await worker.setParameters({ tessedit_pageseg_mode: '4' as never })
      const alt = (await worker.recognize(image)).data.text
      const m = /item\w*\W+sold\W+\d+/i.exec(alt)
      if (m) text += '\n' + m[0]
    }
    onProgress?.('done', 1)
    return text
  } finally {
    await worker.terminate()
  }
}
