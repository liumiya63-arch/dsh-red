/* supply-chain.js — 供应链(股权穿透)展示页
 * 数据源: 项目事实图 fact-graph (category=company 节点 + contains 边 = 持股关系)
 * 域名资产: 复用资产库 (/api/assets, source=xiaolanben/dns)
 * 版本: 20260806-1
 */
(function () {
  'use strict';

  const SC = {
    projectId: '',
    nodes: [], edges: [],
    byKey: {}, childrenOf: {},
  };

  function injectStyle() {
    if (document.getElementById('supply-chain-style')) return;
    const css = `
#page-supply-chain .supply-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
#page-supply-chain .supply-stat-card{background:var(--card-bg,#fff);border:1px solid var(--border-color,#e8ecf1);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.04);padding:10px 16px;min-width:110px}
#page-supply-chain .supply-stat-card .num{font-size:22px;font-weight:700;color:var(--text-primary,#1a1a1a)}
#page-supply-chain .supply-stat-card .lbl{font-size:12px;color:var(--text-secondary,#64748b)}
#page-supply-chain .supply-tree{margin-bottom:16px}
#page-supply-chain .sc-node{margin:6px 0;border-left:2px solid var(--border-color,#e9ecef);padding-left:14px}
#page-supply-chain .sc-node.sc-root{border-left:none;padding-left:0}
#page-supply-chain .sc-card{background:var(--card-bg,#fff);border:1px solid var(--border-color,#e8ecf1);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.04);padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#page-supply-chain .sc-card:hover{border-color:#94a3b8}
#page-supply-chain .sc-name{font-weight:600;font-size:14px}
#page-supply-chain .sc-ratio{background:#e60012;color:#fff;border-radius:10px;padding:2px 8px;font-size:12px;font-weight:600}
#page-supply-chain .sc-ratio.sc-ratio-minor{background:rgba(230,0,18,0.12);color:#e60012}
#page-supply-chain .sc-meta{font-size:12px;color:var(--text-secondary,#64748b);display:flex;gap:14px;flex-wrap:wrap}
#page-supply-chain .sc-detail{font-size:12px;color:var(--text-secondary,#64748b);margin-top:6px;display:none;background:var(--bg-secondary,#f1f3f5);border-radius:6px;padding:8px 12px}
#page-supply-chain .sc-card.sc-open ~ .sc-detail{display:block}
#page-supply-chain .sc-row{display:flex;gap:10px;padding:2px 0;border-bottom:1px dashed rgba(128,128,128,0.15)}
#page-supply-chain .sc-row:last-child{border-bottom:none}
#page-supply-chain .sc-k{min-width:110px;color:var(--text-secondary,#64748b);flex-shrink:0}
#page-supply-chain .sc-v{color:var(--text-primary,#1a1a1a);word-break:break-all}
#page-supply-chain .supply-finance{display:flex;flex-direction:column;gap:6px}
#page-supply-chain .sc-toggle{background:none;border:none;color:var(--text-secondary,#64748b);cursor:pointer;font-size:13px;padding:2px 6px}
#page-supply-chain .sc-children{margin-top:6px;display:none}
#page-supply-chain .sc-card.sc-open ~ .sc-children{display:block}
#page-supply-chain .supply-assets{display:flex;flex-wrap:wrap;gap:8px}
#page-supply-chain .supply-asset-chip{background:rgba(230,0,18,0.05);border:1px solid rgba(230,0,18,0.45);border-radius:14px;padding:3px 12px;font-size:12px;color:#e60012}
#page-supply-chain .supply-section-title{font-size:13px;color:var(--text-secondary,#64748b);margin:14px 0 8px;font-weight:600}
#page-supply-chain .supply-empty{color:var(--text-secondary,#64748b);padding:24px;text-align:center;border:1px dashed var(--border-color,#e9ecef);border-radius:8px}
`;
    const st = document.createElement('style');
    st.id = 'supply-chain-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  async function loadProjects() {
    const res = await apiFetch('/api/projects');
    const d = await res.json();
    const list = Array.isArray(d) ? d : (d.projects || []);
    const sel = document.getElementById('supply-project-select');
    sel.innerHTML = '';
    list.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
    if (list.length) {
      // 默认选最近更新的项目
      list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
      sel.value = list[0].id;
    }
  }

  async function loadGraph(pid) {
    const res = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/fact-graph?view=tree');
    const g = await res.json();
    SC.projectId = pid;
    SC.nodes = g.nodes || [];
    SC.edges = g.edges || [];
    SC.byKey = {};
    SC.childrenOf = {};
    SC.factBodies = {};
    SC.nodes.forEach(n => { SC.byKey[n.fact_key] = n; });
    SC.edges.forEach(e => {
      if (e.type === 'contains' || e.edge_type === 'contains') {
        (SC.childrenOf[e.source] = SC.childrenOf[e.source] || []).push(e.target);
      }
    });
    // graph 节点不含 body，另拉 facts 合并详情（公司/融资/邮箱/ICP 的正文）
    try {
      const res2 = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/facts');
      const facts = await res2.json();
      (Array.isArray(facts) ? facts : []).forEach(f => {
        if (f && f.fact_key) SC.factBodies[f.fact_key] = f.body || '';
      });
    } catch (e) { /* 详情缺失不影响主渲染 */ }
  }

  function parseBody(node) {
    const raw = (SC.factBodies && SC.factBodies[node.fact_key]) || node.body || '';
    try {
      const b = JSON.parse(raw);
      if (typeof b === 'object') return b;
    } catch (e) {}
    // 兼容平台 upsert_project_fact 自动追加的 "## 关联" 尾部文本
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { const b = JSON.parse(m[0]); if (typeof b === 'object') return b; }
    } catch (e) {}
    return {};
  }

  function isCompany(node) {
    return node && (node.category === 'company' || (node.fact_key || '').startsWith('company/'));
  }

  function findRoots() {
    const hasParent = {};
    SC.edges.forEach(e => {
      if (e.type === 'contains' || e.edge_type === 'contains') hasParent[e.target] = true;
    });
    return SC.nodes.filter(n => isCompany(n) && !hasParent[n.fact_key]);
  }

  function extractCompanyName(raw) {
    if (!raw) return raw || '';
    var s = String(raw).trim();
    var cut = s.length;
    // 中文括号截断: 括号内含总结词(持股/控股/对外投资/参保/法人/官网/邮箱/信用代码/注册资本/成立/门店/注销/在营/万/USD/%等),
    // 且括号内容不以 公司/集团/厂/店/社/部/中心/有限/总店 结尾(后者是公司名合法部分, 如"某某(中国)投资有限公司")
    var reBracket = /[（(](?=[^（(]*?(持股|控股|对外投资|参保|注册资本|注册|法人|官网|电话|邮箱|信用代码|任务书|小蓝本|在营|注销|实缴|万|USD|%|成立|branchCnt|门店))/;
    var m = s.match(reBracket);
    if (m && m.index > 0) {
      var closeIdx = s.indexOf('）', m.index);
      if (closeIdx < 0) closeIdx = s.indexOf(')', m.index);
      if (closeIdx > 0) {
        var inner = s.slice(m.index + 1, closeIdx);
        if (!/(公司|集团|厂|店|社|部|中心|有限|总店)$/.test(inner)) {
          cut = Math.min(cut, m.index);
        }
      }
    }
    // 分号截断(中文; 或英文;)
    var semi = s.search(/[；;]/);
    if (semi > 0) cut = Math.min(cut, semi);
    // 冒号/等号截断: summary 常为 "公司名=总结..." 或 "公司名：总结..."
    var eq = s.search(/[=＝：:]/);
    if (eq > 0) cut = Math.min(cut, eq);
    // 逗号截断(中文逗号后是总结), 但公司名内部中文逗号罕见, 且需排除 "有限公司,分公司" 场景
    var comma = s.search(/，/);
    if (comma > 0) {
      var before = s.slice(0, comma);
      if (!/(公司|集团|厂|店|社|部|中心|有限|总店)$/.test(before)) cut = Math.min(cut, comma);
    }
    // 英文括号截断(含 holding/invest/100%/数字%)
    var m2 = s.match(/\((?=[^\(]*?(holding|invest|subsidiar|100%|\d+%))/i);
    if (m2 && m2.index > 0) cut = Math.min(cut, m2.index);
    var name = s.slice(0, cut).trim();
    return name || s;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  function detailRows(body) {
    const labels = { legal: '法定代表人', regcap: '注册资本', esdate: '成立日期', creditCode: '统一社会信用代码',
      regno: '注册号', status: '经营状态', valuation: '估值', stockCode: '股票代码', industry: '行业',
      address: '地址', website: '官网', phone: '电话', email: '邮箱', shareholder: '股东', group: '集团',
      cid: '小蓝本ID', city: '城市', ratio: '持股比例', fr: '法定代表人', name: '公司名称' };
    const rows = [];
    Object.keys(body).forEach(k => {
      const v = body[k];
      if (v === '' || v == null) return;
      rows.push('<div class="sc-row"><span class="sc-k">' + (labels[k] || k) + '</span><span class="sc-v">' + esc(v) + '</span></div>');
    });
    return rows.join('');
  }

  function renderNode(key, depth, parentName) {
    const n = SC.byKey[key];
    if (!n) return '';
    const body = parseBody(n);
    // 公司名: summary 常混入"（某某中国100%；对外投资N家...）"等总结, 提取纯名字
    const rawName = n.summary || n.label || key;
    const name = extractCompanyName(rawName);
    const ratio = body.ratio != null ? body.ratio : '';
    const meta = [];
    if (body.legal) meta.push('法人: ' + body.legal);
    if (body.city) meta.push(body.city);
    if (body.creditCode) meta.push('信用代码: ' + body.creditCode);
    if (body.regcap) meta.push('注册资本: ' + body.regcap);
    if (parentName) meta.push('母公司: ' + parentName);
    const kids = (SC.childrenOf[key] || []).filter(k => SC.byKey[k]);
    const rootCls = depth === 0 ? 'sc-root' : '';
    const ratioBadge = ratio ? `<span class="sc-ratio${ratio < 50 ? ' sc-ratio-minor' : ''}">持股 ${ratio}%</span>` : '';
    const toggle = kids.length ? `<button class="sc-toggle" data-root="${depth === 0 ? '1' : '0'}" onclick="window.__scToggle(this, event)">${depth === 0 ? '展开/收起' : '+'}</button>` : '';
    const hasDetail = Object.keys(body).length > 1 || rawName !== name;
    const doms = [];
    if (body.website && body.website !== 'null') doms.push(String(body.website));
    (body.domains || body.websites || []).forEach(d => { if (d && d !== 'null') doms.push(typeof d === 'object' ? (d.url || d.domain || '') : String(d)); });
    const domChips = doms.length ? `<span class="sc-meta" style="flex-wrap:wrap">${doms.filter(Boolean).map(d => `<span class="sn-sub" style="display:inline-block;color:#e60012;border:1px solid rgba(230,0,18,0.45);border-radius:10px;padding:1px 8px;font-size:11px;background:rgba(230,0,18,0.05)">${esc(d)}</span>`).join('')}</span>` : '';
    // 默认收起: 根节点 sc-card 不带 sc-open(子树折叠, 点击展开)
    const openCls = ''; // 默认全部收起(详情/子树点击展开)
    // 详情区: body 字段 + summary 里的总结信息(对外投资/参保/备注等)放详情, 不污染卡片
    const extraRows = rawName !== name && rawName.trim() ? `<div class="sc-row"><span class="sc-k">备注</span><span class="sc-v">${esc(rawName.trim())}</span></div>` : '';
    return `
      <div class="sc-node ${rootCls}">
        <div class="sc-card${openCls}" onclick="window.__scCardClick(this)">
          ${toggle}
          <span class="sc-name">${esc(name)}</span>${ratioBadge}
          <span class="sc-meta">${meta.join(' · ')}</span>
          ${domChips}
          ${kids.length ? `<span class="sc-meta" style="margin-left:auto">${kids.length} 家下级</span>` : ''}
        </div>
        ${hasDetail ? `<div class="sc-detail">${extraRows}${detailRows(body)}</div>` : ''}
        ${kids.length ? `<div class="sc-children">${kids.map(k => renderNode(k, depth + 1, name)).join('')}</div>` : ''}
      </div>`;
  }

  function renderTree() {
    const roots = findRoots();
    const rootKeys = roots.map(r => r.fact_key);
    const companyNodes = SC.nodes.filter(isCompany);
    const others = companyNodes.filter(n => !rootKeys.includes(n.fact_key) && !SC.edges.some(e => e.target === n.fact_key));

    // 统计
    let lv1 = 0, lv2 = 0;
    rootKeys.forEach(rk => {
      const c1 = SC.childrenOf[rk] || [];
      lv1 += c1.length;
      c1.forEach(c => { lv2 += (SC.childrenOf[c] || []).length; });
    });

    const el = document.getElementById('supply-chain-stats');
    el.innerHTML = `
      <div class="supply-stat-card"><div class="num">${companyNodes.length}</div><div class="lbl">公司节点</div></div>
      <div class="supply-stat-card"><div class="num">${rootKeys.length}</div><div class="lbl">根公司</div></div>
      <div class="supply-stat-card"><div class="num">${lv1}</div><div class="lbl">一级子公司</div></div>
      <div class="supply-stat-card"><div class="num">${lv2}</div><div class="lbl">二级孙公司</div></div>
    `;

    const treeEl = document.getElementById('supply-chain-tree');
    const toolbar = document.getElementById('supply-chain-toolbar');
    if (toolbar) {
      toolbar.innerHTML = `<button type="button" class="btn-ghost btn-sm" onclick="window.__scExpandAll(true)">全部展开</button>
        <button type="button" class="btn-ghost btn-sm" onclick="window.__scExpandAll(false)">全部收起</button>
        <span class="sc-meta" style="margin-left:10px">${companyNodes.length} 家公司 · 点击卡片或 ± 展开/收起</span>`;
    }
    if (!rootKeys.length && !others.length) {
      treeEl.innerHTML = '<div class="supply-empty">暂无供应链数据 — 让 AI 用「信息收集 → AI 一键收集(股权穿透模式)」收集后自动落库，或先给项目导入数据</div>';
    } else {
      treeEl.innerHTML = rootKeys.map(rk => renderNode(rk, 0)).join('') +
        (others.length ? `<div class="supply-section-title">未关联公司（${others.length}）</div>` +
          others.map(n => renderNode(n.fact_key, 0)).join('') : '');
    }
    const blocksEl = document.getElementById('supply-chain-blocks');
    blocksEl.innerHTML = renderFactBlocks();
  }

  async function renderAssets() {
    const el = document.getElementById('supply-chain-assets');
    el.innerHTML = '<div class="supply-empty">加载资产…</div>';
    try {
      // 拉项目全部资产(不过滤 source — 双写导入的资产 source 是 pentrack-sync,
      // 按固定 source 列表过滤会全部漏掉导致资产区为空)
      let items = [];
      for (let page = 1; page <= 3; page++) {
        const res = await apiFetch('/api/assets?project_id=' + encodeURIComponent(SC.projectId) + '&page_size=100&page=' + page);
        const d = await res.json();
        const list = Array.isArray(d) ? d : (d.assets || d.items || []);
        items = items.concat(list);
        if (list.length < 100) break;
      }
      const seen = {};
      items.forEach(a => { const k = a.domain || a.host || a.ip; if (k && !seen[k]) seen[k] = a; });
      const keys = Object.keys(seen);
      el.innerHTML = keys.length
        ? `<div class="supply-section-title">关联域名资产（${keys.length}，来自小蓝本/DNS，含 ICP 备案）</div><div class="supply-assets">` +
          keys.map(k => {
            const a = seen[k];
            let tags = [];
            try { tags = JSON.parse(a.tags_json || '[]'); } catch (e) {}
            const icp = tags.filter(t => /^icp:/i.test(t)).map(t => t.replace(/^icp:/i, ''));
            const chip = `<span class="supply-asset-chip" title="${esc(k)}${icp.length ? '\n备案: ' + icp.join(', ') : ''}">${esc(k)}${icp.length ? ` <span style="color:var(--text-secondary,#64748b)">[${esc(icp[0])}]</span>` : ''}</span>`;
            return chip;
          }).join('') +
          '</div>'
        : '<div class="supply-empty">暂无域名资产</div>';
    } catch (e) {
      el.innerHTML = '<div class="supply-empty">资产加载失败: ' + e.message + '</div>';
    }
  }

  // 非公司类事实区块: 融资 / 邮箱 / ICP备案 / 供应链 / 系统 / 招投标
  function renderFactBlocks() {
    // 只显示股权穿透/供应链相关类别(融资/邮箱/ICP/供应链/系统资产/业务/基础设施),
    // 过滤 target/finding/exploit 等漏洞与攻防事实
    const ALLOW = { financing: 1, contacts: 1, icp: 1, supplychain: 1, infra: 1,
                    business: 1, supply: 1, asset: 1, general: 1 };
    const blocks = {};
    SC.nodes.forEach(n => {
      const cat = n.category || 'other';
      if (cat === 'company') return;
      if (!ALLOW[cat]) return;
      (blocks[cat] = blocks[cat] || []).push(n);
    });
    const hosts = {
      financing: '融资记录', contacts: '联系人邮箱', icp: 'ICP 备案', other: '其他发现'
    };
    let html = '';
    Object.keys(blocks).forEach(cat => {
      const nodes = blocks[cat];
      html += `<div class="supply-section-title">${hosts[cat] || cat}（${nodes.length}）</div>`;
      if (cat === 'financing') {
        html += '<div class="supply-finance">';
        nodes.forEach(n => {
          const b = parseBody(n);
          const rows = Array.isArray(b.list) ? b.list : [b];
          rows.forEach(r => {
            html += `<div class="sc-card" style="margin:6px 0"><span class="sc-meta">${esc(r.date || '')}</span> <span class="sc-name">${esc(r.round || '')}</span> <span class="sc-ratio">${esc(r.amount || '')}</span> <span class="sc-meta">${esc(r.investors || '')}</span></div>`;
          });
        });
        html += '</div>';
      } else if (cat === 'contacts') {
        html += '<div class="supply-assets">' + nodes.map(n => {
          const b = parseBody(n);
          const list = Array.isArray(b.list) ? b.list : (b.emails || []);
          return list.map(e => {
            const val = (e && typeof e === 'object') ? (e.email || e.addr || e.address || e.value || '') : e;
            const remark = (e && typeof e === 'object' && e.remark) ? ' (' + esc(e.remark) + ')' : '';
            return `<span class="supply-asset-chip" title="${esc(remark || '')}">${esc(val)}${remark}</span>`;
          }).join('');
        }).join('') + '</div>';
      } else if (cat === 'icp') {
        html += '<div class="supply-assets">' + nodes.map(n => {
          const b = parseBody(n);
          return `<span class="supply-asset-chip" title="${esc(b.subject || '')}">${esc(n.summary || n.label)} <span style="color:var(--text-secondary,#64748b)">[${esc(b.icp || '')}]</span></span>`;
        }).join('') + '</div>';
      } else {
        html += '<div class="supply-assets">' + nodes.map(n => {
          const b = parseBody(n);
          const parts = [];
          Object.keys(b).forEach(k => {
            const v = b[k];
            if (v == null) return;
            if (typeof v === 'object') {
              const arr = Array.isArray(v) ? v : [v];
              arr.forEach(x => {
                if (x && typeof x === 'object') {
                  const pick = x.domain || x.url || x.name || x.email || x.host || (Array.isArray(x.ips) ? x.ips.join(',') : '');
                  if (pick) parts.push(String(pick));
                } else if (x != null) parts.push(String(x));
              });
            } else if (typeof v === 'string' && v.length < 300) {
              parts.push(v);
            }
          });
          const txt = parts.length ? parts.join(' · ') : (n.summary || n.label);
          return `<span class="supply-asset-chip">${esc(txt.slice(0, 200))}</span>`;
        }).join('') + '</div>';
      }
    });
    return html;
  }

  async function refresh() {
    const pid = document.getElementById('supply-project-select').value;
    if (!pid) return;
    try {
      await loadGraph(pid);
      renderTree();
      await renderAssets();
    } catch (e) {
      document.getElementById('supply-chain-tree').innerHTML = '<div class="supply-empty">加载失败: ' + e.message + '</div>';
    }
  }

  window.__scCardClick = function (el) {
    el.classList.toggle('sc-open');
    var btn = el.querySelector('.sc-toggle');
    if (btn) btn.textContent = el.classList.contains('sc-open') ? '−' : '+';
  };
  window.__scToggle = function (btn, ev) {
    if (ev) ev.stopPropagation();
    const card = btn.closest('.sc-card');
    if (!card) return false;
    const willOpen = !card.classList.contains('sc-open');
    card.classList.toggle('sc-open', willOpen);
    // 收起时把子树内所有子节点也收起(详情/子树显示全由 CSS 兄弟选择器控制)
    if (!willOpen) {
      card.parentNode.querySelectorAll('.sc-children .sc-card').forEach(function (sub) {
        sub.classList.remove('sc-open');
        var subBtn = sub.querySelector('.sc-toggle');
        if (subBtn) subBtn.textContent = '+';
      });
    }
    btn.textContent = willOpen ? '−' : '+';
    return false;
  };
  // 全部展开/收起 (仅根级)
  window.__scExpandAll = function (open) {
    document.querySelectorAll('#supply-chain-tree .sc-card').forEach(function (card) {
      card.classList.toggle('sc-open', !!open);
      var btn = card.querySelector('.sc-toggle');
      if (btn) btn.textContent = open ? '−' : '+';
    });
  };
  window.supplyChainRefresh = refresh;
  window.supplyChainInit = async function () {
    injectStyle();
    await loadProjects();
    const sel = document.getElementById('supply-project-select');
    if (sel.value) await refresh();
  };
})();
