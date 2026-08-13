import { getContext } from '../../../st-context.js';
import { world_names } from '../../../world-info.js';

const COMMAND_NAME = 'wi-tokens';
const COMMAND_ALIASES = ['worldbook-tokens', 'witokens'];
const EXTENSION_NAME = 'worldbook-token-viewer';
const TEMPLATE_EXTENSION_NAME = `third-party/${EXTENSION_NAME}`;
const SETTINGS_CONTAINER = '#extensions_settings2';
const MODAL_ID = 'wbtv_modal';

let context;
let initialized = false;
let currentName = '';
let currentData = null;
let currentSortedItems = [];
let currentEditKey = null;
let currentSearchQuery = '';

const SETTINGS_KEY = 'worldbook-token-viewer';
const defaultSettings = Object.freeze({ enabled: true });

function getSettings() {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') {
        context.extensionSettings = {};
    }

    if (!context.extensionSettings[SETTINGS_KEY]) {
        context.extensionSettings[SETTINGS_KEY] = JSON.parse(JSON.stringify(defaultSettings));
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.prototype.hasOwnProperty.call(context.extensionSettings[SETTINGS_KEY], key)) {
            context.extensionSettings[SETTINGS_KEY][key] = defaultSettings[key];
        }
    }
    return context.extensionSettings[SETTINGS_KEY];
}

function isExtensionEnabled() {
    return getSettings().enabled !== false;
}

function getWorldbookNames() {
    if (Array.isArray(world_names)) {
        return [...world_names];
    }

    if (typeof context?.getWorldInfoNames === 'function') {
        return context.getWorldInfoNames();
    }

    return [];
}

function applyEnabledState() {
    const enabled = isExtensionEnabled();
    $('#wbtv_wand_button').toggle(enabled);
    $('#wbtv_open_button, #wbtv_debug_button').prop('disabled', !enabled);
    if (!enabled) {
        closeViewer();
    }
}

function debugExtension() {
    const settings = getSettings();
    const worldbookNames = getWorldbookNames();
    console.log('[世界书token查看器] settings:', settings);
    console.log('[世界书token查看器] worldbooks:', worldbookNames);
    toastr.info(`扩展状态：${settings.enabled ? '已启用' : '已停用'}；已读取世界书 ${worldbookNames.length} 个。`, '世界书 Token 查看器');
}

function normalizeEntryItems(data) {
    if (!data || typeof data !== 'object') {
        return [];
    }

    if (Array.isArray(data.entries)) {
        return data.entries.map((entry, index) => ({ key: String(index), entry }));
    }

    if (data.entries && typeof data.entries === 'object') {
        return Object.entries(data.entries).map(([key, entry]) => ({ key, entry }));
    }

    if (Array.isArray(data)) {
        return data.map((entry, index) => ({ key: String(index), entry }));
    }

    return [];
}

function sortEntryItems(items) {
    return items
        .map((item, index) => ({ ...item, index }))
        .sort((a, b) => {
            const ai = numberOr(a.entry?.displayIndex, numberOr(a.entry?.order, numberOr(a.entry?.uid, a.index)));
            const bi = numberOr(b.entry?.displayIndex, numberOr(b.entry?.order, numberOr(b.entry?.uid, b.index)));
            return ai - bi;
        });
}

function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getEntryLabel(entry, index) {
    const comment = typeof entry?.comment === 'string' ? entry.comment.trim() : '';
    if (comment) {
        return comment;
    }

    const keys = Array.isArray(entry?.key)
        ? entry.key
        : Array.isArray(entry?.keys)
            ? entry.keys
            : [];

    if (keys.length) {
        return keys.join(', ');
    }

    if (entry?.uid !== undefined) {
        return `词条 #${entry.uid}`;
    }

    return `词条 #${index + 1}`;
}

function isEntryEnabled(entry) {
    if (typeof entry?.enabled === 'boolean') {
        return entry.enabled;
    }

    if (typeof entry?.disable === 'boolean') {
        return !entry.disable;
    }

    return true;
}

function isEntryConstant(entry) {
    return entry?.constant === true || entry?.extensions?.constant === true;
}

function getEntryLight(entry) {
    if (!isEntryEnabled(entry)) {
        return 'off';
    }

    return isEntryConstant(entry) ? 'blue' : 'green';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildStatsHtml(name, items, blueTotal, activeTotal, allTotal, totalCount = items.length, isSearching = false) {
    const statusMap = {
        blue: '<span class="wbtv-light wbtv-light--blue">蓝灯</span>',
        green: '<span class="wbtv-light wbtv-light--green">绿灯</span>',
        off: '<span class="wbtv-light wbtv-light--off">停用</span>',
    };

    const body = items.map((item) => {
        const status = statusMap[item.light] ?? statusMap.off;
        const label = item.label;

        return `
            <tr>
                <td class="wbtv-cell wbtv-cell--status">${status}</td>
                <td class="wbtv-cell" title="${escapeHtml(label)}">${escapeHtml(label)}</td>
                <td class="wbtv-cell wbtv-cell--tokens">${item.tokens}</td>
                <td class="wbtv-cell wbtv-cell--actions">
                    <button type="button" class="menu_button wbtv-edit-entry" data-key="${escapeHtml(item.key)}">编辑</button>
                </td>
            </tr>`;
    }).join('');

    const countLine = isSearching
        ? `<div><strong>匹配词条数：</strong>${items.length} / ${totalCount}</div>`
        : `<div><strong>词条数：</strong>${items.length}</div>`;

    return `
        <div class="wbtv-summary">
            <div><strong>世界书：</strong>${escapeHtml(name)}</div>
            ${countLine}
            <div><strong>蓝灯（常量）总 token：</strong>${blueTotal}</div>
            <div><strong>蓝灯 + 绿灯（已启用）总 token：</strong>${activeTotal}</div>
            <div><strong>全部词条（含停用）总 token：</strong>${allTotal}</div>
        </div>
        <div class="wbtv-table-wrap">
            <table class="wbtv-table">
                <thead>
                    <tr>
                        <th class="wbtv-cell wbtv-cell--status">状态</th>
                        <th class="wbtv-cell">词条</th>
                        <th class="wbtv-cell wbtv-cell--tokens">Token</th>
                        <th class="wbtv-cell wbtv-cell--actions">操作</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>`;
}

function computeTotals(items) {
    let blueTotal = 0;
    let activeTotal = 0;
    let allTotal = 0;

    for (const item of items) {
        allTotal += item.tokens;
        if (item.light !== 'off') {
            activeTotal += item.tokens;
        }
        if (item.light === 'blue') {
            blueTotal += item.tokens;
        }
    }

    return { blueTotal, activeTotal, allTotal };
}

function getFilteredItems() {
    const query = currentSearchQuery.trim().toLowerCase();
    if (!query) {
        return currentSortedItems;
    }

    return currentSortedItems.filter((item) => {
        const label = String(item.label ?? '').toLowerCase();
        const content = String(item.content ?? '').toLowerCase();
        return label.includes(query) || content.includes(query);
    });
}

function renderResults() {
    if (!currentSortedItems.length) {
        $('#wbtv_results').html('<div class="wbtv-empty">当前没有可显示的词条。</div>');
        return;
    }

    const query = String($('#wbtv_entry_search').val() ?? '').trim();
    currentSearchQuery = query;
    const items = getFilteredItems();
    const totals = computeTotals(items);
    const isSearching = Boolean(query);

    $('#wbtv_results').html(buildStatsHtml(
        currentName,
        items,
        totals.blueTotal,
        totals.activeTotal,
        totals.allTotal,
        currentSortedItems.length,
        isSearching,
    ));
}

function applyWorldbookFilter() {
    const query = String($('#wbtv_worldbook_search').val() ?? '').trim().toLowerCase();
    $('#wbtv_select option').each(function () {
        const text = String($(this).text()).toLowerCase();
        $(this).toggle(text.includes(query));
    });
}
async function refreshWorldbookList(preferredName) {
    try {
        await context.updateWorldInfoList();
    } catch {
        // 忽略启动阶段的就绪问题，稍后可以点击刷新重试。
    }

    const select = $('#wbtv_select');
    const names = getWorldbookNames();
    const selected = preferredName || String(select.val() ?? '');

    select.empty();

    if (!names.length) {
        select.append('<option value="">暂无可读取的世界书</option>');
        $('#wbtv_results').html('<div class="wbtv-empty">当前没有可读取的世界书。</div>');
        return;
    }

    names.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === selected) {
            option.selected = true;
        }
        select.append(option);
    });

    applyWorldbookFilter();
}

async function analyzeSelected() {
    const name = String($('#wbtv_select').val() ?? '').trim();
    if (!name) {
        $('#wbtv_results').html('<div class="wbtv-empty">请先选择一个世界书。</div>');
        return;
    }

    $('#wbtv_results').html('<div class="wbtv-empty">正在统计，请稍候…</div>');

    const data = await context.loadWorldInfo(name);
    const rawItems = normalizeEntryItems(data);
    const sorted = sortEntryItems(rawItems);

    if (!sorted.length) {
        $('#wbtv_results').html(`<div class="wbtv-empty">没有在「${escapeHtml(name)}」中找到词条。</div>`);
        return;
    }

    const items = [];

    for (const item of sorted) {
        const content = String(item.entry?.content ?? '');
        const tokens = await context.getTokenCountAsync(content);
        const enabled = isEntryEnabled(item.entry);
        const constant = isEntryConstant(item.entry);
        const tokenNumber = Number(tokens) || 0;

        items.push({
            ...item,
            label: getEntryLabel(item.entry, item.index),
            tokens: tokenNumber,
            light: getEntryLight(item.entry),
            content,
        });
    }

    currentName = name;
    currentData = data;
    currentSortedItems = items;
    currentEditKey = null;
    $('#wbtv_entry_search').val('');
    currentSearchQuery = '';

    renderResults();
    resetEditor();
}
function findCurrentItem(key) {
    return currentSortedItems.find((item) => item.key === key) ?? null;
}

function resetEditor() {
    currentEditKey = null;
    $('#wbtv_editor_title').text('点击左侧词条的“编辑”开始修改');
    $('#wbtv_editor_text').val('');
    $('#wbtv_save_status').text('');
}

function openEditorForItem(item) {
    if (!item) {
        resetEditor();
        return;
    }

    currentEditKey = item.key;
    $('#wbtv_editor_title').text(`正在编辑：${item.label}`);
    $('#wbtv_editor_text').val(String(item.entry?.content ?? ''));
    $('#wbtv_save_status').text('');
}

async function saveCurrentEntry() {
    if (!currentName || !currentData || currentEditKey === null) {
        $('#wbtv_save_status').text('请先选择一个词条进行编辑。');
        return;
    }

    const item = findCurrentItem(currentEditKey);
    if (!item) {
        $('#wbtv_save_status').text('找不到需要保存的词条，请重新统计。');
        return;
    }

    const savedKey = currentEditKey;
    item.entry.content = $('#wbtv_editor_text').val();
    await context.saveWorldInfo(currentName, currentData, true);

    $('#wbtv_save_status').text('已保存。');
    await analyzeSelected();
    const refreshed = findCurrentItem(savedKey);
    if (refreshed) {
        openEditorForItem(refreshed);
        $('#wbtv_save_status').text('已保存并重新统计。');
    }
}

function ensureModal() {
    if ($(`#${MODAL_ID}`).length) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'wbtv-overlay';
    modal.innerHTML = `
        <div class="wbtv-dialog">
            <div class="wbtv-header">
                <h3>世界书 Token 查看器</h3>
                <button type="button" class="wbtv-close" title="关闭">×</button>
            </div>
            <div class="wbtv-toolbar">
                <input id="wbtv_worldbook_search" class="wbtv-search" type="search" placeholder="搜索世界书…">
                <select id="wbtv_select" class="wbtv-select"></select>
                <button type="button" id="wbtv_analyze" class="menu_button">计算 token</button>
                <button type="button" id="wbtv_refresh" class="menu_button">刷新列表</button>
                <input id="wbtv_entry_search" class="wbtv-search" type="search" placeholder="搜索词条名或内容…">
            </div>
            <div class="wbtv-layout">
                <div id="wbtv_results" class="wbtv-results"></div>
                <div class="wbtv-editor">
                    <div id="wbtv_editor_title" class="wbtv-editor-title">点击左侧词条的“编辑”开始修改</div>
                    <textarea id="wbtv_editor_text" class="wbtv-editor-text" spellcheck="false"></textarea>
                    <div class="wbtv-editor-footer">
                        <span id="wbtv_save_status" class="wbtv-save-status"></span>
                        <button type="button" id="wbtv_save" class="menu_button">保存到世界书</button>
                    </div>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);

    $('.wbtv-close').on('click', closeViewer);
    $('.wbtv-overlay').on('mousedown', (event) => {
        if (event.target === event.currentTarget) {
            closeViewer();
        }
    });

    $('#wbtv_refresh').on('click', async () => {
        await refreshWorldbookList();
    });

    $('#wbtv_analyze').on('click', analyzeSelected);
    $('#wbtv_save').on('click', saveCurrentEntry);

    $('#wbtv_worldbook_search').on('input', applyWorldbookFilter);
    $('#wbtv_entry_search').on('input', renderResults);

    $('#wbtv_results').on('click', '.wbtv-edit-entry', (event) => {
        const key = event.currentTarget.dataset.key;
        const item = findCurrentItem(key);
        openEditorForItem(item);
    });
}
async function openViewer(preferredName) {
    try {
        if (!isExtensionEnabled()) {
            toastr.warning('扩展未启用，请先在扩展设置中打开“世界书 Token 查看器”。', '世界书 Token 查看器');
            return;
        }
        ensureModal();
        $('#wbtv_worldbook_search').val('');
        $('#wbtv_entry_search').val('');
        currentSearchQuery = '';
        await refreshWorldbookList(preferredName);
        $(`#${MODAL_ID}`).addClass('wbtv-open');
    } catch (error) {
        console.error('[世界书token查看器] 打开查看器失败', error);
        toastr.error(`打开查看器失败：${error?.message ?? error}`, '世界书 Token 查看器');
    }
}

function closeViewer() {
    $(`#${MODAL_ID}`).removeClass('wbtv-open');
}

function addWandButton() {
    const wand = document.getElementById('extensionsMenu');
    if (!wand) {
        return;
    }

    if ($('#wbtv_wand_button').length) {
        return;
    }

    const button = document.createElement('div');
    button.id = 'wbtv_wand_button';
    button.className = 'list-group-item flex-container flexGap5 interactable wbtv-wand-button';
    button.tabIndex = 0;
    button.title = '世界书 Token 查看器';
    button.innerHTML = '<i class="fa-solid fa-book-open"></i><span>世界书 Token 查看器</span>';
    button.addEventListener('click', () => openViewer());
    wand.appendChild(button);

    if (!isExtensionEnabled()) {
        button.style.display = 'none';
    }

    const menuButton = $('#extensionsMenuButton');
    if (menuButton.length) {
        menuButton.css('display', 'flex');
    }
}

async function renderSettingsPanel() {
    if (!$(SETTINGS_CONTAINER).length) {
        return;
    }

    if ($('#wbtv_settings').length) {
        return;
    }

    const html = await context.renderExtensionTemplateAsync(
        TEMPLATE_EXTENSION_NAME,
        'settings',
        {},
    );

    $(SETTINGS_CONTAINER).append(html);

    $('#wbtv_enabled')
        .prop('checked', getSettings().enabled)
        .on('input', (event) => {
            getSettings().enabled = Boolean($(event.target).prop('checked'));
            if (typeof context.saveSettingsDebounced === 'function') {
                context.saveSettingsDebounced();
            }
            applyEnabledState();
        });

    $('#wbtv_open_button').on('click', () => openViewer());
    $('#wbtv_debug_button').on('click', debugExtension);

    applyEnabledState();
}

function makeEnumProvider() {
    return () => getWorldbookNames().map((name) => (
        new context.SlashCommandEnumValue(name, name, 'enum', '📚')
    ));
}

function makeNamedArgumentList() {
    return [
        context.SlashCommandNamedArgument.fromProps({
            name: 'name',
            description: '要查看的世界书名称。不填时打开查看器后再选择。',
            typeList: [context.ARGUMENT_TYPE.STRING],
            isRequired: false,
            enumProvider: makeEnumProvider(),
        }),
    ];
}

function makeUnnamedArgumentList() {
    return [
        context.SlashCommandArgument.fromProps({
            description: '要查看的世界书名称。不填时打开查看器后再选择。',
            typeList: [context.ARGUMENT_TYPE.STRING],
            isRequired: false,
            enumProvider: makeEnumProvider(),
        }),
    ];
}

async function commandCallback(namedArguments, unnamedArguments) {
    const directName = String(namedArguments?.name ?? '').trim();
    const unnamedName = Array.isArray(unnamedArguments)
        ? String(unnamedArguments[0] ?? '').trim()
        : String(unnamedArguments ?? '').trim();

    const requestedName = directName || unnamedName;
    const names = getWorldbookNames();

    if (!names.length) {
        await context.Popup.show.text('世界书 Token 查看器', '当前没有可读取的世界书。', {
            okButton: '知道了',
            cancelButton: false,
        });
        return '';
    }

    let preferredName = null;

    if (requestedName) {
        preferredName = names.find((item) => item.localeCompare(requestedName, undefined, { sensitivity: 'base' }) === 0)
            ?? names.find((item) => item.toLowerCase() === requestedName.toLowerCase())
            ?? null;
    }

    await openViewer(preferredName);
    return '';
}

async function init() {
    if (initialized) {
        return;
    }

    context = getContext();

    try {
        await context.updateWorldInfoList();
    } catch {
        // 若启动阶段尚未就绪，稍后可以在查看器内刷新。
    }

    const command = context.SlashCommand.fromProps({
        name: COMMAND_NAME,
        aliases: COMMAND_ALIASES,
        callback: commandCallback,
        namedArgumentList: makeNamedArgumentList(),
        unnamedArgumentList: makeUnnamedArgumentList(),
        returns: 'void',
        helpString: '打开世界书 Token 查看器，选择世界书后统计每个词条的 token，并可直接编辑世界书内容。',
    });

    context.SlashCommandParser.addCommandObject(command);

    initialized = true;

    addWandButton();

    if ($(SETTINGS_CONTAINER).length) {
        await renderSettingsPanel();
    }

    applyEnabledState();

    context.eventSource.on(context.eventTypes.APP_READY, async () => {
        addWandButton();

        if ($(SETTINGS_CONTAINER).length) {
            await renderSettingsPanel();
        }

        applyEnabledState();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}