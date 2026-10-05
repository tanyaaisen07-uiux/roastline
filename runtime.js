/* Roastline micro-runtime: renders {{holes}}, <sc-for>, <sc-if> templates and patches the DOM with morphdom so CSS transitions keep working. */
(function () {
  var HOLE = /\{\{([\s\S]*?)\}\}/g;
  var cache = {};
  function compile(expr) { return cache[expr] || (cache[expr] = new Function('__s', 'with(__s){ return (' + expr + '); }')); }
  function evalIn(expr, scope) { try { return compile(expr)(scope); } catch (e) { return undefined; } }
  function interp(str, scope) { return str.replace(HOLE, function (_, e) { var v = evalIn(e, scope); return v == null || typeof v === 'function' ? '' : String(v); }); }
  function whole(str) { var m = /^\s*\{\{([\s\S]*)\}\}\s*$/.exec(str); return m ? m[1] : null; }
  var EVENTS = { onclick: 'click', onchange: 'change', onsubmit: 'submit', oninput: 'input' };

  function expand(node, scope, reg) {
    var kids = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) { if (k.nodeValue.indexOf('{{') !== -1) k.nodeValue = interp(k.nodeValue, scope); continue; }
      if (k.nodeType !== 1) continue;
      var tag = k.tagName.toLowerCase();
      if (tag === 'sc-for') {
        var list = evalIn(whole(k.getAttribute('list')) || '[]', scope) || [];
        var as = k.getAttribute('as');
        var frag = document.createDocumentFragment();
        for (var j = 0; j < list.length; j++) {
          var t = document.createElement('template'); t.innerHTML = k.innerHTML; var tmp = t.content;
          var sc = Object.create(scope); sc[as] = list[j]; sc.index = j;
          expand(tmp, sc, reg);
          frag.appendChild(tmp);
        }
        k.parentNode.replaceChild(frag, k); continue;
      }
      if (tag === 'sc-if') {
        var v = evalIn(whole(k.getAttribute('value')) || 'false', scope);
        if (v) { expand(k, scope, reg); var f2 = document.createDocumentFragment(); while (k.firstChild) f2.appendChild(k.firstChild); k.parentNode.replaceChild(f2, k); }
        else k.parentNode.removeChild(k);
        continue;
      }
      var attrs = Array.prototype.slice.call(k.attributes);
      for (var a = 0; a < attrs.length; a++) {
        var at = attrs[a], name = at.name, val = at.value;
        if (name.indexOf('hint-') === 0) { k.removeAttribute(name); continue; }
        if (val.indexOf('{{') === -1) continue;
        var w = whole(val);
        if (w !== null) {
          var r = evalIn(w, scope);
          if (EVENTS[name]) { k.removeAttribute(name); if (typeof r === 'function') { var id = reg.length; reg.push(r); k.setAttribute('data-on-' + EVENTS[name], id); } continue; }
          if (typeof r === 'function' || r === false || r == null) k.removeAttribute(name);
          else if (r === true) k.setAttribute(name, '');
          else k.setAttribute(name, String(r));
        } else k.setAttribute(name, interp(val, scope));
      }
      expand(k, scope, reg);
    }
  }

  var app, tpl, inst, reg = [], queued = false, mounted = false, prevState = null;

  function render() {
    queued = false;
    var vals = inst.renderVals();
    var newReg = [];
    var root = app.cloneNode(false);
    var frag = tpl.content.cloneNode(true);
    expand(frag, Object.assign({}, vals), newReg);
    root.appendChild(frag);
    reg = newReg;
    morphdom(app, root, {
      onBeforeElUpdated: function (from, to) {
        if (from.tagName === 'INPUT' && (from.type === 'range') && document.activeElement === from && from.value === to.getAttribute('value')) return true;
        return !from.isEqualNode(to);
      }
    });
    if (!mounted) { mounted = true; if (inst.componentDidMount) inst.componentDidMount(); }
    else if (inst.componentDidUpdate) inst.componentDidUpdate({}, prevState);
  }

  window.DCLogic = function DCLogic(props) { this.props = props || {}; this.state = {}; };
  window.DCLogic.prototype.setState = function (s) {
    if (!prevState) prevState = Object.assign({}, this.state);
    var patch = typeof s === 'function' ? s(this.state, this.props) : s;
    this.state = Object.assign({}, this.state, patch);
    if (!queued) { queued = true; var self = this; Promise.resolve().then(function () { var p = prevState; prevState = p; render(); prevState = null; }); }
  };
  window.DCLogic.prototype.forceUpdate = function () { this.setState({}); };

  function dispatch(type, test) {
    document.addEventListener(type, function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-on-' + type + ']') : null;
      if (!el && type === 'input') el = e.target && e.target.closest ? e.target.closest('[data-on-change]') : null;
      if (!el) return;
      if (test && !test(el, e)) return;
      var id = el.getAttribute('data-on-' + type); if (id == null) id = el.getAttribute('data-on-change');
      var fn = reg[+id]; if (fn) fn.call(el, e);
    }, type === 'submit');
  }
  dispatch('click');
  dispatch('submit');
  // React-style onChange: fire on every input for text/range, on change for select/checkbox/radio
  dispatch('input', function (el) { return !(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio'); });
  dispatch('change', function (el) { return el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio'; });

  window.DC = {
    mount: function (Comp) {
      app = document.getElementById('app');
      tpl = document.getElementById('tpl');
      inst = new Comp({});
      render();
    }
  };
})();
