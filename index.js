import { getContext } from '../../../st-context.js';

const COMMAND_NAME = 'wi-tokens';
const COMMAND_ALIASES = ['worldbook-tokens', 'witokens'];
const EXTENSION_NAME = 'worldbook-token-counter';
const TEMPLATE_EXTENSION_NAME = `third-party/${EXTENSION_NAME}`;
const SETTINGS_CONTAINER = '#extensions_settings2';

let context;
let initialized = false;

/**
 * 把不同形态的世界书数据统一转换成词条数组。
 * SillyTavern 的世界书 JSON 通常是 { entries: { "0": {...}, "1": {...} } }。
 */
function normalizeEntries(data) {
    if (!data || typeof data !== 'object') {
        return [];
    }

    if (Array.isArray(data.entries)) {
        return data.entries;
    }

    if (data.entries && typeof data.entries === 'object') {
        return Object.values(data.entries);
    }

    if (Array.isArray(data)) {
        return data;
    }

    return [];
}

function sortEntries(entries) {
    return entries
        .map((entry, index) => ({ entry, index }))
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
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function buildStatsHtml(name, rows, blueTotal, activeTotal, allTotal) {
    const statusMap = {
        blue: '<span class="wbtc-light wbtc-light--blue">蓝灯</span>',
        green: '<span class="wbtc-light wbtc-light--green">绿灯</span>',
        off: '<span class="wbtc-light wbtc-light--off">停用</span>',
    };

    const body = rows.map((row) => {
        const status = statusMap[row.light] ?? statusMap.off;

        return `
            <tr>
                <td class="wbtc-cell wbtc-cell--status">${status}</td>
                <td class="wbtc-cell" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</td>
                <td class="wbtc-cell wbtc-cell--tokens">${row.tokens}</td>
            </tr>`;
    }).join('');

    return `
        <div class="wbtc-summary">
            <div><strong>世界书：</strong>${escapeHtml(name)}</div>
            <div><strong>词条数：</strong>${rows.length}</div>
            <div><strong>蓝灯（常量）总 token：</strong>${blueTotal}</div>
            <div><strong>蓝灯 + 绿灯（已启用）总 token：</strong>${activeTotal}</div>
            <div><strong>全部词条（含停用）总 token：</strong>${allTotal}</div>
        </div>
        <div class="wbtc-table-wrap">
            <table class="wbtc-table">
                <thead>
                    <tr>
                        <th class="wbtc-cell wbtc-cell--status">状态</th>
                        <th class="wbtc-cell">词条</th>
                        <th class="wbtc-cell wbtc-cell--tokens">Token</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>`;
}

async function analyzeWorldbook(name) {
    if (!name) {
        return;
    }

    const data = await context.loadWorldInfo(name);
    const entries = normalizeEntries(data);

    if (!entries.length) {
        $('#wbtc_results').html(`<div class="wbtc-empty">没有在「${escapeHtml(name)}」中找到词条。</div>`);
        return;
    }

    const sorted = sortEntries(entries);
    const rows = [];
    let blueTotal = 0;
    let activeTotal = 0;
    let allTotal = 0;

    for (const { entry, index } of sorted) {
        const content = String(entry?.content ?? '');
        const tokens = await context.getTokenCountAsync(content);
        const enabled = isEntryEnabled(entry);
        const constant = isEntryConstant(entry);
        const tokenNumber = Number(tokens) || 0;

        allTotal += tokenNumber;
        if (enabled) {
            activeTotal += tokenNumber;
        }
        if (enabled && constant) {
            blueTotal += tokenNumber;
        }

        rows.push({
            label: getEntryLabel(entry, index),
            tokens: tokenNumber,
            light: getEntryLight(entry),
        });
    }

    const html = buildStatsHtml(name, rows, blueTotal, activeTotal, allTotal);
    $('#wbtc_results').html(html);
}

async function refreshWorldbookList() {
    try {
        await context.updateWorldInfoList();
    } catch {
        // 忽略启动阶段可能的就绪问题，稍后可直接重试。
    }

    const select = $('#wbtc_worldbook_select');
    const current = String(select.val() ?? '');
    const names = context.getWorldInfoNames();

    select.empty();

    if (!names.length) {
        select.append('<option value="">暂无可读取的世界书</option>');
        $('#wbtc_results').html('<div class="wbtc-empty">当前没有可读取的世界书。</div>');
        return;
    }

    names.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === current) {
            option.selected = true;
        }
        select.append(option);
    });
}

async function renderSettingsPanel() {
    if (!$(SETTINGS_CONTAINER).length) {
        return;
    }

    if ($('#wbtc_settings').length) {
        return;
    }

    const html = await context.renderExtensionTemplateAsync(
        TEMPLATE_EXTENSION_NAME,
        'settings',
        {},
    );

    $(SETTINGS_CONTAINER).append(html);

    $('#wbtc_refresh').on('click', async () => {
        await refreshWorldbookList();
    });

    $('#wbtc_analyze').on('click', async () => {
        const name = String($('#wbtc_worldbook_select').val() ?? '').trim();
        if (!name) {
            $('#wbtc_results').html('<div class="wbtc-empty">请先选择一个世界书。</div>');
            return;
        }

        $('#wbtc_results').html('<div class="wbtc-empty">正在统计，请稍候…</div>');
        await analyzeWorldbook(name);
    });

    await refreshWorldbookList();
}

async function showPopupForName(name) {
    if (!name) {
        return;
    }

    const data = await context.loadWorldInfo(name);
    const entries = normalizeEntries(data);

    if (!entries.length) {
        await context.Popup.show.text('Worldbook Token Counter', `没有在「${escapeHtml(name)}」中找到词条。`, {
            okButton: '知道了',
            cancelButton: false,
        });
        return;
    }

    const sorted = sortEntries(entries);
    const rows = [];
    let blueTotal = 0;
    let activeTotal = 0;
    let allTotal = 0;

    for (const { entry, index } of sorted) {
        const content = String(entry?.content ?? '');
        const tokens = await context.getTokenCountAsync(content);
        const enabled = isEntryEnabled(entry);
        const constant = isEntryConstant(entry);
        const tokenNumber = Number(tokens) || 0;

        allTotal += tokenNumber;
        if (enabled) {
            activeTotal += tokenNumber;
        }
        if (enabled && constant) {
            blueTotal += tokenNumber;
        }

        rows.push({
            label: getEntryLabel(entry, index),
            tokens: tokenNumber,
            light: getEntryLight(entry),
        });
    }

    const html = buildStatsHtml(name, rows, blueTotal, activeTotal, allTotal);
    await context.Popup.show.text('Worldbook Token Counter', html, {
        okButton: '关闭',
        cancelButton: false,
        wide: true,
    });
}

async function chooseWorldbook(names) {
    const result = await context.Popup.show.text(
        '选择世界书',
        '请选择要统计 token 的世界书：',
        {
            okButton: false,
            cancelButton: '取消',
            customButtons: names,
        },
    );

    if (typeof result === 'number' && result >= 2) {
        const index = result - 2;
        return names[index] ?? null;
    }

    return null;
}

function makeEnumProvider() {
    return () => context.getWorldInfoNames().map((name) => (
        new context.SlashCommandEnumValue(name, name, 'enum', '📚')
    ));
}

function makeNamedArgumentList() {
    return [
        context.SlashCommandNamedArgument.fromProps({
            name: 'name',
            description: '要统计 token 的世界书名称。不填时弹出选择器。',
            typeList: [context.ARGUMENT_TYPE.STRING],
            isRequired: false,
            enumProvider: makeEnumProvider(),
        }),
    ];
}

function makeUnnamedArgumentList() {
    return [
        context.SlashCommandArgument.fromProps({
            description: '要统计 token 的世界书名称。不填时弹出选择器。',
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
    const names = context.getWorldInfoNames();

    if (!names.length) {
        await context.Popup.show.text('Worldbook Token Counter', '当前没有可读取的世界书。', {
            okButton: '知道了',
            cancelButton: false,
        });
        return '';
    }

    let name = null;

    if (requestedName) {
        name = names.find((item) => item.localeCompare(requestedName, undefined, { sensitivity: 'base' }) === 0)
            ?? names.find((item) => item.toLowerCase() === requestedName.toLowerCase())
            ?? null;

        if (!name) {
            await context.Popup.show.text(
                'Worldbook Token Counter',
                `没有找到世界书「${escapeHtml(requestedName)}」。`,
                { okButton: '知道了', cancelButton: false },
            );
            return '';
        }
    } else {
        name = await chooseWorldbook(names);
    }

    await showPopupForName(name);
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
        // 若启动阶段尚未就绪，稍后再由下拉框刷新。
    }

    const command = context.SlashCommand.fromProps({
        name: COMMAND_NAME,
        aliases: COMMAND_ALIASES,
        callback: commandCallback,
        namedArgumentList: makeNamedArgumentList(),
        unnamedArgumentList: makeUnnamedArgumentList(),
        returns: 'void',
        helpString: '统计指定世界书里每个词条的 token 数，并分别给出：蓝灯（常量）总 token、蓝灯+绿灯（已启用）总 token、全部词条（含停用）总 token。不带参数时会弹出世界书选择器。',
    });

    context.SlashCommandParser.addCommandObject(command);

    initialized = true;

    if ($(SETTINGS_CONTAINER).length) {
        await renderSettingsPanel();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
