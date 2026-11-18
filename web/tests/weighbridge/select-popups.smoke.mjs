import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const menuPath = '/weighbridge/master/parties';
const permission = 'weighbridge:parties';
const pending = {
  id: 1, name: '个人供货登记', nature: 'individual', isSupplier: true, status: 'pending',
  siteCode: 'W01', siteName: '甲厂', temporaryCode: 'T-P-32b03127120115689d936aba867fff68',
  version: 1, receivedAt: '2026-11-18T03:10:00Z',
};
const dataByPath = {
  '/auth/me': { id: 1, username: 'admin', nickname: '管理员', roles: [{ id: 1, roleCode: 'ADMIN' }] },
  '/auth/menus': [{
    id: 1, parentId: 0, menuName: '往来主体', menuType: 'MENU', path: menuPath, visible: 1,
    component: 'weighbridge/master/parties', permissionCode: permission, children: [],
  }],
  '/auth/permissions': [permission],
  '/weighbridge/master/categories': [],
  '/weighbridge/master/temporary-parties': [pending, { ...pending, id: 2, name: '已归并登记', status: 'merged' }],
  '/weighbridge/master/parties': Array.from({ length: 82 }, (_, index) => ({
    code: `C-P-${String(index + 1).padStart(4, '0')}`,
    name: index === 0 ? '上海供货公司' : `北京供货商${index}`,
    nature: 'enterprise', enabled: true, isSupplier: true, contacts: [],
  })),
};

async function pickOption(page, input, name) {
  const popup = page.locator('.ant-select-dropdown:visible').getByText(name, { exact: true });
  await popup.click({ trial: true });
  const bounds = await popup.evaluate((element) => {
    const rect = element.closest('.ant-select-dropdown').getBoundingClientRect();
    return {
      left: rect.left, right: rect.right,
      viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth,
    };
  });
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  assert.ok(bounds.left >= -1 && bounds.right <= bounds.viewport + 1, `${name} 的浮层越界`);
  assert.ok(bounds.pageWidth <= bounds.viewport + 1, `${name} 的浮层造成页面横向溢出`);
  await popup.click();
}

const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  for (const profile of [
    { width: 1480, zoom: 1.25, reducedMotion: 'reduce' },
    { width: 540, zoom: 1, reducedMotion: 'reduce' },
    { width: 1480, zoom: 1.25, reducedMotion: 'no-preference' },
    { width: 540, zoom: 1, reducedMotion: 'no-preference' },
  ]) {
    const page = await browser.newPage({
      viewport: { width: profile.width, height: 820 }, deviceScaleFactor: 1.25, reducedMotion: profile.reducedMotion,
    });
    page.setDefaultTimeout(4000);
    await page.addInitScript(() => localStorage.setItem('base-admin-auth', JSON.stringify({ token: 'fixture' })));
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      if (path.endsWith('/stream')) return route.abort();
      return route.fulfill({ json: { code: 200, message: 'success', data: dataByPath[path] ?? null } });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${menuPath}`);
    await page.getByText('上海供货公司', { exact: true }).waitFor();
    await page.evaluate((zoom) => { document.body.style.zoom = zoom; }, profile.zoom);

    const identity = page.getByRole('combobox', { name: '身份' });
    await identity.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]').click();
    await pickOption(page, identity, '供应商');

    await page.getByRole('tab', { name: '临时主体' }).click();
    const status = page.getByRole('combobox', { name: '状态' });
    const statusControl = status.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]');
    await statusControl.click();
    await pickOption(page, status, '已归并');
    await page.getByText('已归并登记', { exact: true }).waitFor();
    assert.equal(await page.getByText('个人供货登记', { exact: true }).count(), 0);
    await statusControl.click();
    await pickOption(page, status, '待处理');

    await page.getByRole('button', { name: '核对 个人供货登记' }).click();
    const dialog = page.getByRole('dialog');
    const party = dialog.getByRole('combobox', { name: '拟归并的正式主体' });
    await party.click();
    await party.fill('上');
    await pickOption(page, party, '上海供货公司（C-P-0001）');
    assert.equal(await dialog.getByRole('button', { name: '确认归并' }).isEnabled(), true);
    console.log(`${profile.width}px / ${profile.reducedMotion}：下拉定位与选择通过`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
