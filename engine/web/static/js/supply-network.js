/* supply-network.js — 供应链(供应商/供应链公司资产)可视化页
 * 供应链公司: company facts 名称含 供应链/供应/物流
 * 资产: 按主域名集群分组展示(如 hwwt2.com 下 22 子域)
 * 事实: fact_key 前缀 supplychain/ 或 category=infra/supplychain
 * 版本: 20260807-1
 */
(function () {
  'use strict';

  const SN = { projectId: '', nodes: [], edges: [], byKey: {}, factBodies: {}, childrenOf: {} };

  function injectStyle() {
    if (document.getElementById('supply-network-style')) return;
    const css = `
#page-supply-network .supply-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
#page-supply-network .supply-stat-card{background:var(--card-bg,#fff);border:1px solid var(--border-color,#e8ecf1);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.04);padding:10px 16px;min-width:110px}
#page-supply-network .supply-stat-card .num{font-size:22px;font-weight:700;color:var(--text-primary,#1a1a1a)}
#page-supply-network .supply-stat-card .lbl{font-size:12px;color:var(--text-secondary,#64748b)}
#page-supply-network .supply-section-title{font-size:13px;color:var(--text-secondary,#64748b);margin:14px 0 8px;font-weight:600}
#page-supply-network .sc-card{background:var(--card-bg,#fff);border:1px solid var(--border-color,#e8ecf1);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.04);padding:10px 14px;margin:6px 0}
#page-supply-network .sc-name{font-weight:600;font-size:14px}
#page-supply-network .sc-meta{font-size:12px;color:var(--text-secondary,#64748b);display:flex;gap:14px;flex-wrap:wrap}
#page-supply-network .supply-companies{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
#page-supply-network .sc-ratio{background:#e60012;color:#fff;border-radius:10px;padding:2px 8px;font-size:12px;font-weight:600}
#page-supply-network .sc-ratio.sc-ratio-minor{background:rgba(230,0,18,0.12);color:#e60012}
#page-supply-network .sc-row{display:flex;gap:10px;padding:2px 0;border-bottom:1px dashed rgba(128,128,128,0.15)}
#page-supply-network .sc-row:last-child{border-bottom:none}
#page-supply-network .sc-k{min-width:100px;color:var(--text-secondary,#64748b);flex-shrink:0}
#page-supply-network .sc-v{color:var(--text-primary,#1a1a1a);word-break:break-all}
#page-supply-network .sn-cluster{border:1px solid var(--border-color,#e8ecf1);border-radius:10px;margin:10px 0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
#page-supply-network .sn-cluster-head{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:rgba(100,116,139,0.08)}
#page-supply-network .sn-cluster-head:hover{background:rgba(100,116,139,0.14)}
#page-supply-network .sn-cluster-name{font-weight:700;font-size:15px;color:var(--text-primary,#1a1a1a)}
#page-supply-network .sn-cluster-tag{background:var(--card-bg,#fff);border:1px solid var(--border-color,#e9ecef);border-radius:10px;padding:1px 8px;font-size:11px;color:var(--text-secondary,#64748b)}
#page-supply-network .sn-cluster-body{padding:10px 14px}
#page-supply-network .sn-group{margin:6px 0}
#page-supply-network .sn-group-label{font-size:12px;color:var(--text-secondary,#64748b);margin-bottom:4px}
#page-supply-network .sn-sub{display:inline-block;background:rgba(230,0,18,0.05);border:1px solid rgba(230,0,18,0.45);border-radius:6px;padding:3px 10px;margin:2px 4px 2px 0;font-size:12px;font-family:Consolas,monospace;color:#e60012}
#page-supply-network .sn-sub .sn-ip{color:rgba(230,0,18,0.65);font-size:11px}
#page-supply-network .supply-empty{color:var(--text-secondary,#64748b);padding:24px;text-align:center;border:1px dashed var(--border-color,#e9ecef);border-radius:8px}
`;
    const st = document.createElement('style');
    st.id = 'supply-network-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  function registrableDomain(d) {
    d = String(d || '').toLowerCase().replace(/^www\./, '');
    if (!d) return '';
    if (d.startsWith('xn--')) return d;
    const parts = d.split('.');
    if (parts.length <= 2) return d;
    const twoLevel = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'ac.cn'];
    const last2 = parts.slice(-2).join('.');
    if (twoLevel.includes(last2) && parts.length >= 3) return parts.slice(-3).join('.');
    return last2;
  }

  async function loadProjects() {
    const res = await apiFetch('/api/projects');
    const d = await res.json();
    const list = Array.isArray(d) ? d : (d.projects || []);
    const sel = document.getElementById('sn-project-select');
    sel.innerHTML = '';
    list.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
    if (list.length) { list.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')); sel.value = list[0].id; }
  }

  async function loadGraph(pid) {
    const res = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/fact-graph?view=tree');
    const g = await res.json();
    SN.projectId = pid;
    SN.nodes = g.nodes || [];
    SN.edges = g.edges || [];
    SN.byKey = {}; SN.childrenOf = {}; SN.factBodies = {};
    SN.nodes.forEach(n => { SN.byKey[n.fact_key] = n; });
    SN.edges.forEach(e => { if (e.type === 'contains' || e.edge_type === 'contains') (SN.childrenOf[e.source] = SN.childrenOf[e.source] || []).push(e.target); });
    try {
      const res2 = await apiFetch('/api/projects/' + encodeURIComponent(pid) + '/facts');
      const facts = await res2.json();
      (Array.isArray(facts) ? facts : []).forEach(f => { if (f && f.fact_key) SN.factBodies[f.fact_key] = f.body || ''; });
    } catch (e) {}
  }

  function parseBody(node) {
    const raw = (SN.factBodies && SN.factBodies[node.fact_key]) || node.body || '';
    try { const b = JSON.parse(raw); if (typeof b === 'object') return b; } catch (e) {}
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { const b = JSON.parse(m[0]); if (typeof b === 'object') return b; }
    } catch (e) {}
    return {};
  }

  // 供应链公司: company 类全部显示(含股权树子孙公司; 名称含供应链/供应/物流 的供应商也在内)
  function supplyCompanies() {
    const out = [];
    SN.nodes.forEach(n => {
      if (n.category !== 'company' && !(n.fact_key || '').startsWith('company/')) return;
      const body = parseBody(n);
      const name = body.name || n.summary || n.label || n.fact_key;
      out.push({ node: n, body, name });
    });
    return out;
  }

  // hwwt2.com 子域业务标签（AI 落库确认）
  const HWWT_TAGS = { vysccp: '供应商协同门户', esp: '需求预测平台ESP', dcps: '供应链协同DCPS', 'cps-api': '协同API', scmcollege: '供应链学院', ifoodsafety: '食安追溯', esign: '电子签', magicbox: '数据中台', 'cmd.fis': '财务系统FIS', ssotest: 'SSO测试', ipsuat: 'IP系统UAT', 'ms-f-ifd': '消息服务', portal: '门户', master: '主数据', ssdp: 'SSDP', vlps: 'VLPS', rios: 'RIOS' };

  // 供应链数字资产映射: 域名(聚类) / 系统(IP+端口) / URL(站点) 三类
  function clusterAssets(assets) {
    const domains = {};
    const systems = [];
    const urls = [];
    assets.forEach(a => {
      const host = (a.host || '').trim();
      const domain = (a.domain || '').trim();
      const ip = (a.ip || '').trim();
      const port = a.port || '';
      const proto = (a.protocol || '').trim();
      const title = a.title || a.server || '';
      // 1) URL/站点: 有 protocol 或 (host+port) 且非纯 IP → 拼站点
      if (proto && (host || domain)) {
        const u = proto + '://' + (host || domain) + (port ? ':' + port : '');
        urls.push({ url: u, host: host || domain, port: port, proto: proto, title: title });
        return;
      }
      // 2) 系统: IP 资产(含端口) — 注意 ip 字段存真实 IP, host 单独保留
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip) {
        const sysHost = host || ip;
        const sysPort = port || '';
        const label = sysHost + (sysPort ? ':' + sysPort : '');
        systems.push({ host: sysHost, ip: /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : '', port: sysPort, proto: proto, title: title, label: label });
        return;
      }
      // 3) 域名: 按注册域聚类
      const dom = domain || host;
      if (!dom) return;
      const root = registrableDomain(dom);
      if (!root) return;
      (domains[root] = domains[root] || []).push({ domain: dom, ip: ip, title: title, port: port, proto: proto });
    });
    // 域名聚类
    const domOut = [];
    const singles = [];
    Object.keys(domains).forEach(root => {
      const subs = domains[root];
      const full = subs.filter(s => (s.domain || '').toLowerCase() !== root);
      const groups = {};
      full.forEach(s => {
        const sub = (s.domain || '').toLowerCase().replace('.' + root, '');
        const base = sub.split('.')[0];
        const tag = HWWT_TAGS[base] || (sub.includes('test') || sub.includes('uat') ? '测试环境' : '其他功能');
        (groups[tag] = groups[tag] || []).push({ ...s, sub });
      });
      if (!full.length) {
        singles.push({ domain: root, ip: subs[0].ip || '', title: subs[0].title || '' });
        return;
      }
      domOut.push({ root: root, total: subs.length, groups: groups, hasMain: subs.some(s => (s.domain || '').toLowerCase() === root), mainIp: (subs.find(s => (s.domain || '').toLowerCase() === root) || {}).ip || '' });
    });
    if (singles.length) {
      domOut.push({ root: '独立域名', total: singles.length, groups: { '': singles.map(s => ({ domain: s.domain, sub: s.domain, ip: s.ip, title: s.title })) }, hasMain: false, mainIp: '' });
    }
    domOut.sort((a, b) => b.total - a.total);
    systems.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    return { domains: domOut, systems: systems, urls: urls };
  }

  // 从事实 body 解析系统清单(asset/systems_* 等), 补充资产库 dedup 后丢失的 host:port
  // 匹配: "- host (ip:port/port 指纹) 业务名" 形态, 行尾中文=平台名称(title)
  function systemsFromFacts() {
    const out = [];
    const keys = Object.keys(SN.factBodies || {});
    keys.forEach(k => {
      if (!/systems|nongxinyin|linongmall|panorama/.test(k) && !/系统/.test(SN.byKey[k] ? (SN.byKey[k].summary || '') : '')) return;
      const raw = SN.factBodies[k] || '';
      if (typeof raw !== 'string' || raw.length < 10) return;
      // 逐行抓 host(:port) (ip:port...) 业务名
      raw.split(/\r?\n/).forEach(line => {
        if (!/[\w.-]+\.(com|cn|net|org)(\.[a-z]{2,})?/.test(line)) return;
        const m = line.match(/([\w.-]+\.(?:com|cn|net|org)(?:\.[a-z]{2,})?)(?:\s*\((\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5})(?:\/\d{1,5})*)?\))?(?::(\d{1,5})(?:\/\d{1,5})*)?/);
        if (!m) return;
        const host = m[1];
        const ip = m[2] || '';
        const port = m[3] || m[4] || '';   // (ip:port) 内的 port 优先, 否则 host:port
        // 业务名: 行尾中文(括号/指纹/端口之后), 如 "开放银行" "信贷审批系统" "东莞农商行商城"
        let title = '';
        const after = line.slice(m.index + m[0].length);
        const tm = after.match(/([\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z0-9·\-（）()]{1,20})/);
        if (tm) title = tm[1];
        // title 噪音过滤: 描述性片段不是业务名
        if (/主体|条）|指向|可能接入|独立商城|数百端口|title=|等$/.test(title)) title = '';
        // 过滤纯裸域名(无端口无IP无业务名, 如 "example.com" 单独成行);
        // 有 IP 或有业务名(= xxx商城/银行) 的保留 — 业务入口也属于系统面
        if (!port && !ip && !title) return;
        // 去重(同 host 不同业务名保留第一个)
        const key = host + ':' + port;
        if (out.some(s => s.key === key)) return;
        out.push({ key, host, port, ip, label: host + (port ? ':' + port : ''), title: title });
      });
    });
    return out;
  }

  async function render() {
    const pid = document.getElementById('sn-project-select').value;
    if (!pid) return;
    await loadGraph(pid);

    // 统计
    const companies = supplyCompanies();
    const el = document.getElementById('sn-stats');
    el.innerHTML = `
      <div class="supply-stat-card"><div class="num">${companies.length}</div><div class="lbl">公司节点</div></div>
      <div class="supply-stat-card"><div class="num">${SN.nodes.filter(n => (n.fact_key || '').startsWith('supplychain/') || (n.fact_key || '').startsWith('supply/') || ['supplychain', 'infra', 'supply', 'asset', 'business'].includes(n.category)).length}</div><div class="lbl">供应链事实</div></div>`;

    // 供应链公司网格
    const ce = document.getElementById('sn-companies');
    if (!companies.length) {
      ce.innerHTML = '<div class="supply-empty">暂无公司节点（company facts）</div>';
    } else {
      ce.innerHTML = companies.map(c => {
        const b = c.body;
        const ratio = b.ratio != null ? `<span class="sc-ratio${b.ratio < 50 ? ' sc-ratio-minor' : ''}">持股 ${b.ratio}%</span>` : '';
        const rows = [];
        const legal = b.legal || b.fr;
        if (legal) rows.push('<div class="sc-row"><span class="sc-k">法人</span><span class="sc-v">' + esc(legal) + '</span></div>');
        if (b.city) rows.push('<div class="sc-row"><span class="sc-k">城市</span><span class="sc-v">' + esc(b.city) + '</span></div>');
        if (b.creditCode) rows.push('<div class="sc-row"><span class="sc-k">信用代码</span><span class="sc-v">' + esc(b.creditCode) + '</span></div>');
        if (b.regcap) rows.push('<div class="sc-row"><span class="sc-k">注册资本</span><span class="sc-v">' + esc(b.regcap) + '</span></div>');
        const doms = Array.isArray(b.domains) ? b.domains.filter(Boolean) : [];
        const domChips = doms.length ? `<div style="margin-top:6px">${doms.map(d => `<span class="sn-sub" style="display:inline-block;color:#e60012;border:1px solid rgba(230,0,18,0.45);border-radius:10px;padding:1px 8px;font-size:11px;background:rgba(230,0,18,0.05);margin:2px 4px 2px 0">${esc(d)}</span>`).join('')}</div>` : '';
        return `<div class="sc-card"><div class="sc-name">${esc(c.name)}</div> ${ratio}
          <div style="margin-top:6px">${rows.join('') || '<span class="sc-meta">无详情（待补）</span>'}</div>${domChips}</div>`;
      }).join('');
    }

    // 资产集群
    const ae = document.getElementById('sn-clusters');
    ae.innerHTML = '<div class="supply-empty">加载资产…</div>';
    try {
      // 拉项目全部资产(不过滤 source — 双写导入的资产 source 是 pentrack-sync,
      // 按固定 source 列表过滤会全部漏掉导致数字资产为空)
      let items = [];
      for (let page = 1; page <= 3; page++) {
        const res = await apiFetch('/api/assets?project_id=' + encodeURIComponent(pid) + '&page_size=100&page=' + page);
        const d = await res.json();
        const pageItems = Array.isArray(d) ? d : (d.assets || d.items || []);
        items = items.concat(pageItems);
        if (pageItems.length < 100) break;
      }
      const cluster = clusterAssets(items);
      const parts = [];
      // 1) 域名聚类
      if (cluster.domains.length) {
        const domTotal = cluster.domains.reduce((n, c) => n + c.total, 0);
        parts.push('<div class="supply-section-title">域名（' + domTotal + '）</div>');
        parts.push(cluster.domains.map((c, i) => `
          <div class="sn-cluster">
            <div class="sn-cluster-head" onclick="window.__snToggle(this)">
              <span style="font-size:13px">${i + 1}.</span>
              <span class="sn-cluster-name">${esc(c.root)}</span>
              <span class="sn-cluster-tag">${c.total} 个</span>
              ${c.mainIp ? `<span class="sn-cluster-tag">主站 ${esc(c.mainIp)}</span>` : ''}
              <span style="margin-left:auto;color:var(--text-secondary,#64748b)">▾</span>
            </div>
            <div class="sn-cluster-body">
              ${Object.keys(c.groups).map(grp => `
                <div class="sn-group">${grp ? `<div class="sn-group-label">${esc(grp)}</div>` : ''}
                  ${c.groups[grp].map(s => `<span class="sn-sub">${esc(s.sub === s.domain ? s.sub : s.sub + '.' + c.root)}${s.ip ? ` <span class="sn-ip">(${esc(s.ip)})</span>` : ''}${s.title ? ` <span class="sc-meta">${esc(s.title)}</span>` : ''}</span>`).join('')}
                </div>`).join('')}
              ${!Object.keys(c.groups).length ? '<span class="sc-meta">仅主域名（无子域）</span>' : ''}
            </div>
          </div>`).join(''));
      }
      // 2) 系统/IP — 资产库系统 + 事实 body 解析的系统(asset/systems_* 全量), 去重合并
      const factSystems = systemsFromFacts();
      const sysMap = {};
      cluster.systems.forEach(s => { sysMap[s.label] = s; });
      factSystems.forEach(fs => {
        if (sysMap[fs.label]) {
          // 资产库项缺 title/ip 时用 fact 解析的补全
          if (!sysMap[fs.label].title && fs.title) sysMap[fs.label].title = fs.title;
          if (!sysMap[fs.label].ip && fs.ip) sysMap[fs.label].ip = fs.ip;
        } else {
          sysMap[fs.label] = fs;
        }
      });
      const allSystems = Object.values(sysMap);
      if (allSystems.length) {
        parts.push('<div class="supply-section-title">系统 / IP（' + allSystems.length + '）</div>');
        parts.push('<div class="supply-assets" style="display:flex;flex-wrap:wrap;gap:8px">' +
          allSystems.map(s => `<span class="sn-sub" title="${esc(s.title || '')}">${esc(s.label)}${s.ip ? ` <span class="sn-ip">(${esc(s.ip)})</span>` : ''}${s.title ? ` <span class="sn-ip">${esc(s.title)}</span>` : ''}</span>`).join('') +
          '</div>');
      }
      // 3) URL / 站点
      if (cluster.urls.length) {
        parts.push('<div class="supply-section-title">URL / 站点（' + cluster.urls.length + '）</div>');
        parts.push('<div class="supply-assets" style="display:flex;flex-wrap:wrap;gap:8px">' +
          cluster.urls.map(u => `<span class="sn-sub" title="${esc(u.title || '')}">${esc(u.url)}${u.title ? ` <span class="sn-ip">${esc(u.title)}</span>` : ''}</span>`).join('') +
          '</div>');
      }
      ae.innerHTML = parts.length ? parts.join('') : '<div class="supply-empty">暂无资产</div>';
    } catch (e) {
      ae.innerHTML = '<div class="supply-empty">资产加载失败: ' + esc(e.message) + '</div>';
    }

    // 供应链事实
    const fe = document.getElementById('sn-facts');
    const facts = SN.nodes.filter(n => (n.fact_key || '').startsWith('supplychain/')
        || (n.fact_key || '').startsWith('supply/')
        || ['supplychain', 'infra', 'supply', 'asset', 'business'].includes(n.category));
    fe.innerHTML = facts.length ? facts.map(n => {
      const b = parseBody(n);
      const bodyTxt = Object.keys(b).length ? Object.values(b).join(' · ') : '';
      return `<div class="sc-card"><span class="sc-name">${esc(n.summary || n.label || n.fact_key)}</span>
        <div class="sc-meta" style="margin-top:4px">${esc(bodyTxt.slice(0, 200))}</div></div>`;
    }).join('') : '<div class="supply-empty">暂无供应链事实</div>';
  }

  window.__snToggle = function (head) {
    const body = head.nextElementSibling;
    if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
  };
  window.supplyNetworkRefresh = render;
  window.supplyNetworkInit = async function () {
    injectStyle();
    await loadProjects();
    const sel = document.getElementById('sn-project-select');
    if (sel.value) await render();
  };
})();
