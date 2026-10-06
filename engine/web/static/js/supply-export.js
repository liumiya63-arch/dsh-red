/* supply-export.js — 股权穿透 / 供应链 xlsx 导出(纯前端, SheetJS 0.18.5 本地化)
 * 用法: 页面注入按钮 onclick="exportSupplyExcel('<selectId>','equity'|'supply')"
 * 数据源: /api/projects/:id/fact-graph?view=tree + /facts + /assets(分页拉全)
 * 与 pentrack scripts/export_xlsx.py 导出内容对齐(公司节点/持股关系/融资/系统/招投标)
 */
(function () {
  'use strict';

  // ---- 灰色商务按钮: 默认灰渐变, hover/点击变品牌红 #e60012 ----
  if (!document.getElementById('supply-export-style')) {
    var css = [
      '.btn-export-excel{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;',
      'border:1px solid #d5d9e0;border-radius:6px;',
      'background:linear-gradient(135deg,#4a4f57 0%,#2b2f36 100%);color:#fff;',
      'font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;',
      'transition:background .15s ease,border-color .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.12);user-select:none}',
      '.btn-export-excel:hover{background:linear-gradient(135deg,#ff4d4f 0%,#e60012 100%);border-color:#e60012}',
      '.btn-export-excel:active{background:linear-gradient(135deg,#e60012 0%,#b0000c 100%)}',
      '.btn-export-excel:disabled{opacity:.55;cursor:not-allowed}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'supply-export-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- 数据工具 ----
  function parseBody(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { var b = JSON.parse(raw); if (typeof b === 'object') return b; } catch (e) { /* fallthrough */ }
    try { var m = raw.match(/\{[\s\S]*\}/); if (m) { var b2 = JSON.parse(m[0]); if (typeof b2 === 'object') return b2; } } catch (e) { /* text body */ }
    return {};
  }
  function factName(byKey, key) {
    var f = byKey[key];
    if (f) {
      var b = parseBody(f.body);
      if (b.name) return b.name;
      if (f.summary) return f.summary;
    }
    return key || '';
  }
  function getPid(selectId) {
    var sel = document.getElementById(selectId);
    return sel ? sel.value : '';
  }
  function getProjName(selectId) {
    var sel = document.getElementById(selectId);
    if (sel && sel.selectedOptions && sel.selectedOptions[0]) return sel.selectedOptions[0].textContent;
    return 'project';
  }

  async function fetchAll(pid) {
    var gRes = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/fact-graph?view=tree');
    var g = await gRes.json();
    var fRes = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/facts');
    var factsRaw = await fRes.json();
    var facts = Array.isArray(factsRaw) ? factsRaw : (factsRaw.facts || []);
    var assets = [];
    for (var page = 1; page <= 10; page++) {
      var aRes = await apiFetch('/api/assets?project_id=' + encodeURIComponent(pid) + '&page_size=100&page=' + page);
      var a = await aRes.json();
      var list = Array.isArray(a) ? a : (a.assets || []);
      assets = assets.concat(list);
      if (list.length < 100) break;
    }
    var byKey = {};
    facts.forEach(function (f) { if (f && f.fact_key) byKey[f.fact_key] = f; });
    return { nodes: g.nodes || [], edges: g.edges || [], facts: facts, assets: assets, byKey: byKey };
  }

  // ---- equity 视角: 公司节点 / 持股关系(BFS 层级) / 融资记录 / 域名资产 ----
  function equitySheets(d) {
    var compRows = [['fact_key', '公司名', '持股比例%', '法人', '城市', '信用代码', '注册资本', '成立日期', '状态', '官网', '域名', '邮箱', '备注']];
    d.facts.forEach(function (f) {
      if (f.category !== 'company' && f.fact_key.indexOf('company/') !== 0) return;
      var b = parseBody(f.body);
      compRows.push([f.fact_key, factName(d.byKey, f.fact_key),
        b.ratio != null ? b.ratio : '', b.legal || '', b.city || '', b.creditCode || '',
        b.regcap || '', b.esdate || '', b.status || '', b.website || '',
        (b.domains || []).join(' '), (b.emails || []).join(' '), b.note || '']);
    });

    var contains = d.edges.filter(function (e) {
      return (e.type === 'contains' || e.edge_type === 'contains') &&
        e.source.indexOf('company/') === 0 && e.target.indexOf('company/') === 0;
    });
    var childrenOf = {}, parentsOf = {};
    contains.forEach(function (e) {
      (childrenOf[e.source] = childrenOf[e.source] || []).push(e.target);
      (parentsOf[e.target] = parentsOf[e.target] || []).push(e.source);
    });
    var roots = d.facts.filter(function (f) {
      return f.fact_key.indexOf('company/') === 0 && !(parentsOf[f.fact_key] || []).length;
    }).map(function (f) { return f.fact_key; });
    if (!roots.length && contains.length) roots.push(contains[0].source);
    var level = {}, q = roots.map(function (r) { return [r, 1]; });
    while (q.length) {
      var item = q.shift(), k = item[0], lv = item[1];
      if (level[k] !== undefined) continue;
      level[k] = lv;
      (childrenOf[k] || []).forEach(function (c) { if (level[c] === undefined) q.push([c, lv + 1]); });
    }
    var edgeRows = [['层级', '母公司', '子公司', '持股比例%', '母fact_key', '子fact_key']];
    contains.forEach(function (e) {
      var sub = d.byKey[e.target];
      var ratio = sub ? (parseBody(sub.body).ratio != null ? parseBody(sub.body).ratio : '') : '';
      edgeRows.push([level[e.source] != null ? level[e.source] : '', factName(d.byKey, e.source),
        factName(d.byKey, e.target), ratio, e.source, e.target]);
    });

    var finRows = [['fact_key', '日期', '轮次', '金额', '投资方/详情']];
    d.facts.forEach(function (f) {
      var b = parseBody(f.body);
      if (f.category === 'financing' || f.fact_key.indexOf('financing/') === 0) {
        if (Array.isArray(b.list)) {
          b.list.forEach(function (it) { finRows.push([f.fact_key, it.date || '', it.round || '', it.amount || '', (it.investors || []).join(' ')]); });
        } else {
          finRows.push([f.fact_key, '', '', '', String(f.body || '').slice(0, 500)]);
        }
      } else if (f.category === 'company' || f.fact_key.indexOf('company/') === 0) {
        if (Array.isArray(b.financing)) {
          b.financing.forEach(function (it) { finRows.push([f.fact_key, it.date || '', it.round || '', it.amount || '', (it.investors || []).join(' ')]); });
        }
        if (typeof f.body === 'string' && f.body.indexOf('融资史') >= 0) {
          var m = f.body.match(/融资史[:：]\s*([\s\S]+)/);
          if (m) finRows.push([f.fact_key, '', '', '', m[1].trim().slice(0, 500)]);
        }
      }
    });

    var assetRows = [['host', 'domain', 'ip', 'port', 'service', '来源', '创建时间']];
    d.assets.forEach(function (a) {
      assetRows.push([a.host || '', a.domain || '', a.ip || '', a.port || '', a.service || '', a.source || '', a.created_at || '']);
    });
    return [['公司节点', compRows], ['持股关系', edgeRows], ['融资记录', finRows], ['域名资产', assetRows]];
  }

  // ---- supply 视角: 供应链公司 / 域名资产 / 系统清单 / 招投标 ----
  var SYSTEM_LINE = /^\s*[-•*]?\s*([A-Za-z0-9._-]+(?:\.[A-Za-z]{2,})?)(?::(\d+))?(?:\s*\((\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?\))?(?:\s+\(([^)]*)\))?\s*(.*)$/;

  function supplySheets(d) {
    var compRows = [['fact_key', '公司名', '类别', '定位/简介', '法人', '注册资本', '官网', '邮箱', '地址']];
    d.facts.forEach(function (f) {
      var key = f.fact_key, cat = f.category;
      var isC = cat === 'company' || key.indexOf('company/') === 0;
      var isS = cat === 'supply' || cat === 'supplychain' || cat === 'infra' || cat === 'business' ||
        key.indexOf('supply/') === 0 || key.indexOf('supplychain/') === 0;
      if (!isC && !isS) return;
      var b = parseBody(f.body);
      compRows.push([key, factName(d.byKey, key), isC ? 'company' : (cat || 'supply'),
        f.summary || '', b.legal || '', b.regcap || '', b.website || '',
        (b.emails || []).join(' '), b.address || '']);
    });

    var assetRows = [['host', 'domain', 'ip', 'port', 'service', '来源', '创建时间']];
    d.assets.forEach(function (a) {
      assetRows.push([a.host || '', a.domain || '', a.ip || '', a.port || '', a.service || '', a.source || '', a.created_at || '']);
    });

    var sysRows = [['fact_key', '系统/主机', 'IP', '端口', '业务/平台名']];
    d.facts.forEach(function (f) {
      var key = f.fact_key;
      if (typeof f.body !== 'string') return;
      var hit = key.indexOf('systems') >= 0 ||
        ((key.indexOf('asset/') === 0 || key.indexOf('supply/') === 0 || key.indexOf('supplychain/') === 0) &&
          (key.toLowerCase().indexOf('system') >= 0 || f.body.slice(0, 200).indexOf('系统') >= 0));
      if (!hit) return;
      f.body.split('\n').forEach(function (ln) {
        ln = ln.trim();
        if (!ln || /^(小蓝本|\d+\.)/.test(ln)) return;
        var m = SYSTEM_LINE.exec(ln);
        if (m && m[1] && m[1].indexOf('.') >= 0) {
          var host = m[1], port = m[2] || '', ip = m[3] || '', ipport = m[4] || '', paren = m[5] || '',
            biz = (m[6] || '').replace(/\s*title=.*$/, '').replace(/^=\s*/, '').trim();
          if (!(port || ip || ipport || biz)) return;
          sysRows.push([key, host, ip, port || ipport, biz || paren]);
        }
      });
    });

    var bidRows = [['fact_key', '内容']];
    d.facts.forEach(function (f) {
      var key = f.fact_key;
      var body = typeof f.body === 'object' ? JSON.stringify(f.body) : String(f.body || '');
      if (!(key.indexOf('bidding') >= 0 || key.indexOf('招标') >= 0 || key.indexOf('招投标') >= 0 ||
            body.indexOf('招标') >= 0 || body.indexOf('中标') >= 0 || body.indexOf('供应商') >= 0)) return;
      var lines = body.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) { bidRows.push([key, '']); return; }
      lines.forEach(function (ln) { bidRows.push([key, ln]); });
    });
    return [['供应链公司', compRows], ['域名资产', assetRows], ['系统清单', sysRows], ['招投标', bidRows]];
  }

  // ---- 商务报表样式 (exceljs) ----
  var TITLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3A3F45' } };
  var HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A4F57' } };
  var SUB_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEFF3' } };
  var ZEBRA_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F6F8' } };
  var RED = { argb: 'FFE60012' };
  var BORDER = {
    top: { style: 'thin', color: { argb: 'FFE1E5EB' } }, left: { style: 'thin', color: { argb: 'FFE1E5EB' } },
    bottom: { style: 'thin', color: { argb: 'FFE1E5EB' } }, right: { style: 'thin', color: { argb: 'FFE1E5EB' } }
  };

  // 红字点缀列: 公司节点/系统清单 C列, 持股关系 D列
  function redColOf(name) {
    if (name === '公司节点' || name === '系统清单') return 3;
    if (name === '持股关系') return 4;
    return 0;
  }

  async function buildWorkbook(sheets, titlePrefix, subtitle) {
    if (typeof ExcelJS === 'undefined') {
      throw new Error('exceljs 库未加载(vendor/exceljs.min.js)');
    }
    var wb = new ExcelJS.Workbook();
    wb.created = new Date();
    sheets.forEach(function (pair) {
      var name = pair[0], aoa = pair[1];
      var ws = wb.addWorksheet(name.slice(0, 31));
      var ncol = aoa[0].length;
      // 标题行(深灰白字) + 副标题(浅灰)
      ws.addRow([titlePrefix + ' · ' + name]);
      ws.mergeCells(1, 1, 1, ncol);
      ws.getRow(1).height = 24;
      var tc = ws.getCell(1, 1);
      tc.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      tc.fill = TITLE_FILL;
      tc.alignment = { vertical: 'middle', horizontal: 'left' };
      ws.addRow([subtitle]);
      ws.mergeCells(2, 1, 2, ncol);
      ws.getRow(2).height = 15;
      var sc = ws.getCell(2, 1);
      sc.font = { size: 9, color: { argb: 'FF6C757D' } };
      sc.fill = SUB_FILL;
      sc.alignment = { vertical: 'middle', horizontal: 'left' };
      // 表头(中灰白字居中)
      var hr = ws.addRow(aoa[0]);
      hr.height = 18;
      hr.eachCell(function (c) {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = HEADER_FILL;
        c.alignment = { vertical: 'middle', horizontal: 'center' };
        c.border = BORDER;
      });
      // 数据: 细边框 + 斑马纹 + 换行
      aoa.slice(1).forEach(function (r, ri) {
        var row = ws.addRow(r);
        row.eachCell(function (c) {
          c.border = BORDER;
          c.alignment = { vertical: 'top', wrapText: true };
          if (ri % 2 === 1) c.fill = ZEBRA_FILL;
        });
      });
      // 红字点缀: 比例/IP 列非空值
      var rc = redColOf(name);
      if (rc) {
        for (var i = 3; i <= ws.rowCount; i++) {
          var cell = ws.getCell(i, rc);
          if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
            cell.font = { color: RED };
          }
        }
      }
      // 列宽
      aoa[0].forEach(function (h, ci) {
        var w = String(h).length + 2;
        aoa.slice(1, 201).forEach(function (r) {
          if (r[ci] != null) w = Math.max(w, Math.min(String(r[ci]).length + 2, 60));
        });
        ws.getColumn(ci + 1).width = Math.max(w, 8);
      });
      ws.views = [{ state: 'frozen', ySplit: 3 }];
    });
    return wb;
  }

  function triggerDownload(blob, fname) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 3000);
  }

  // ---- 入口 ----
  window.exportSupplyExcel = async function (selectId, view) {
    var pid = getPid(selectId);
    if (!pid) { alert('请先选择项目'); return; }
    var btn = document.querySelector('.btn-export-excel[data-export="' + view + '"]');
    var oldText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }
    try {
      var d = await fetchAll(pid);
      var sheets = view === 'equity' ? equitySheets(d) : supplySheets(d);
      var projName = getProjName(selectId);
      var wb = await buildWorkbook(sheets, projName,
        '导出时间: ' + new Date().toLocaleString('zh-CN', { hour12: false }) + ' | DesRedTeam');
      var ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      var fname = projName + '_' + view + '_' + ts + '.xlsx';
      var buf = await wb.xlsx.writeBuffer();
      triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
    } catch (e) {
      console.error('[supply-export]', e);
      alert('导出失败: ' + (e && e.message ? e.message : e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText || '导出Excel'; }
    }
  };
})();
