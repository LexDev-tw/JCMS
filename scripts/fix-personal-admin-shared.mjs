/** 自 use-personal-admin.js 抽出共用常數／函式，供 composable 與 create-app 使用 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const composables = path.join(ROOT, 'public', 'js', 'jcms', 'composables');
const srcPath = path.join(composables, 'use-personal-admin.js');
const sharedPath = path.join(composables, 'personal-admin-shared.js');
const appPath = path.join(ROOT, 'public', 'js', 'jcms', 'app', 'create-app.js');

const src = fs.readFileSync(srcPath, 'utf8');
const marker = 'export function usePersonalAdmin';
const splitIdx = src.indexOf(marker);
if (splitIdx < 0) throw new Error('usePersonalAdmin marker not found');

let sharedBody = src.slice(src.indexOf('\n', src.indexOf("import { util }")) + 1, splitIdx).trimEnd();
sharedBody = sharedBody
  .replace(/^function /gm, 'export function ')
  .replace(/^const /gm, 'export const ');

const sharedFile = `/** 個人行政：薪資／俸表／職涯／差勤共用常數與純函式 */
import { util } from '../utils.js';

${sharedBody}
`;

fs.writeFileSync(sharedPath, sharedFile, 'utf8');

const useFile = `import { ref, reactive, computed, watch, nextTick } from '../vue-api.js';
import { util } from '../utils.js';
import {
    applyPersonalAdminFromPayload,
    buildInitialPayscaleRowOverrides,
    isPersonalAdminBlobMeaningful,
    migrateSalaryYearBook,
    personalAdminBlobPayloadSize,
    personalAdminToDbPayload,
    PERSONAL_ADMIN_KEY,
    readPersonalAdminRaw,
    tryMigrateSalaryRecordsToYearBook,
} from './personal-admin-shared.js';

${src.slice(splitIdx)}
`;

fs.writeFileSync(composables + '/use-personal-admin.js', useFile, 'utf8');

/** create-app 直接引用的 shared 符號 */
const appImports = [
  'ensureSalaryYear',
  'salaryYearFootAggregate',
  'SALARY_YEAR_ROWS',
  'SALARY_ADD_COLS',
  'SALARY_SUB_COLS',
  'SALARY_TRANSPOSE_ROWS',
  'salaryRowAddSum',
  'salaryRowSubSum',
  'salaryTransposeHandleTabKeydown',
  'PAYSCALE_BUILTIN_EFFECTIVE_ROC7',
  'PAYSCALE_BUILTIN_ROWS',
  'PAYSCALE_NEW_FORM_GRADE_POINTS',
  'payscaleRowTotal',
  'formatCareerSpanPeriod',
  'buildCareerTimelineLayout',
  'buildCareerTimelineTicks',
  'sanitizeCareerTimelineLinks',
  'syncCalendarWeek',
  'careerRowInterval',
  'careerRowAttachments',
  'careerAttachmentLabelFromUrl',
  'careerIsoAtNoonMs',
  'migrateCareerTimelineRecord',
  'careerRowHasAttachment',
];

let app = fs.readFileSync(appPath, 'utf8');
const importBlock = `import {\n  ${appImports.join(',\n  ')},\n} from '../composables/personal-admin-shared.js';\n`;

if (!app.includes("from '../composables/personal-admin-shared.js'")) {
  app = app.replace(
    /import { useDynamics } from '\.\.\/composables\/use-dynamics\.js';\n\n/,
    `import { useDynamics } from '../composables/use-dynamics.js';\n${importBlock}\n`
  );
  fs.writeFileSync(appPath, app, 'utf8');
}

console.log('[fix-personal-admin-shared] wrote personal-admin-shared.js, updated imports');
