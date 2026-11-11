import { icebreaker } from '@icebreakers/eslint-config'
import { miniProgramRuntimeRecommended } from 'weapp-vite/eslint'

export default icebreaker({
  miniProgram: true,
  rules: { 'test/no-import-node-test': 'off' },
  ignores: ['.tmp/**', 'docs/**', 'README.md', 'AGENTS*.md', 'CLAUDE.md', 'package-lock.json', 'dist/**', '.weapp-vite/**', 'src/features/plate-ocr/**'],
}).append(miniProgramRuntimeRecommended)
