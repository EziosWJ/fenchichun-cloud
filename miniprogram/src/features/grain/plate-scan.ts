import { supportsVisionOCR, VisionOcrService } from '@/features/plate-ocr/vision-ocr'

export interface PlateScanResult {
  candidates: string[]
  suggestions: string[]
  rawTexts: string[]
}

/** 对整张照片做端侧 OCR，供登记页拍照识别车牌。 */
export async function recognizePlatePhoto(imagePath: string): Promise<PlateScanResult> {
  if (!supportsVisionOCR()) {
    throw new Error('当前微信或设备不支持拍照识别，请手动输入车牌')
  }
  const service = new VisionOcrService()
  const result = await service.recognize({
    imagePath,
    preview: { width: 0, height: 0 },
    frame: { x: 0, y: 0, width: 0, height: 0 },
    fullImage: true,
    onPreview: () => {},
  })
  return {
    candidates: result.candidates,
    suggestions: result.suggestions.map(item => item.text),
    rawTexts: result.rawTexts,
  }
}
