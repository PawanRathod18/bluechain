/*!
 * BlueChain API client for static pages.
 *
 * Drop this file next to your HTML and load it with a plain script tag:
 *
 *   <script src="bluechain-api.js"></script>
 *   <script>
 *     const bc = BlueChain.createClient('http://127.0.0.1:8000');
 *     await bc.login('pawan@bluechain.dev', 'BlueChain@123');
 *     const projects = await bc.listProjects();
 *   </script>
 *
 * No build step, no dependencies. Works from Live Server, file://-served pages
 * will NOT work (CORS + no secure context), use http://127.0.0.1:5500 instead.
 */
(function (global) {
  'use strict'

  var TOKEN_KEY = 'bluechain.token'

  function ApiError(message, status, detail) {
    var e = new Error(message)
    e.name = 'ApiError'
    e.status = status
    e.detail = detail
    return e
  }

  function createClient(baseUrl, options) {
    options = options || {}
    var base = (baseUrl || 'http://127.0.0.1:8000').replace(/\/+$/, '')
    var tokenKey = options.tokenKey || TOKEN_KEY

    function getToken() {
      try { return localStorage.getItem(tokenKey) } catch (e) { return null }
    }
    function setToken(t) {
      try {
        if (t) localStorage.setItem(tokenKey, t)
        else localStorage.removeItem(tokenKey)
      } catch (e) { /* private mode */ }
    }

    async function request(path, opts) {
      opts = opts || {}
      var headers = {}
      var token = getToken()
      if (token) headers.Authorization = 'Bearer ' + token
      if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json'

      var res
      try {
        res = await fetch(base + path, {
          method: opts.method || 'GET',
          headers: headers,
          body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined)
        })
      } catch (networkError) {
        throw ApiError(
          'Cannot reach the BlueChain API at ' + base + '. Is the backend running? (' + networkError.message + ')',
          0
        )
      }

      if (res.status === 204) return null
      var text = await res.text()
      var data = null
      try { data = text ? JSON.parse(text) : null } catch (e) { data = text }

      if (!res.ok) {
        var detail = data && (data.detail || data.message)
        if (Array.isArray(detail)) detail = detail.map(function (d) { return d.msg || d }).join('; ')
        if (res.status === 401) setToken(null)
        throw ApiError(detail || 'Request failed (' + res.status + ')', res.status, detail)
      }
      return data
    }

    return {
      baseUrl: base,
      getToken: getToken,
      setToken: setToken,

      /* ---------------- auth ---------------- */
      async login(email, password) {
        var body = new URLSearchParams({ username: email, password: password })
        var res = await fetch(base + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body
        })
        var data = await res.json().catch(function () { return null })
        if (!res.ok) throw ApiError((data && data.detail) || 'Login failed', res.status)
        setToken(data.access_token)
        return data.user
      },
      register: function (payload) {
        return request('/api/auth/register', { method: 'POST', body: payload }).then(function (d) {
          setToken(d.access_token)
          return d.user
        })
      },
      logout: function () { setToken(null) },
      me: function () { return request('/api/auth/me') },
      health: function () { return request('/api/health') },

      /* ---------------- projects ---------------- */
      listProjects: function (query) {
        var qs = query ? '?' + new URLSearchParams(query).toString() : ''
        return request('/api/projects' + qs)
      },
      getProject: function (id) { return request('/api/projects/' + id) },
      createProject: function (payload) { return request('/api/projects', { method: 'POST', body: payload }) },
      updateBoundary: function (id, boundary) {
        return request('/api/projects/' + id + '/boundary', { method: 'PUT', body: { boundary: boundary } })
      },
      submitProject: function (id) { return request('/api/projects/' + id + '/submit', { method: 'POST' }) },
      measureGeometry: function (boundary) {
        return request('/api/geometry/measure', { method: 'POST', body: { boundary: boundary } })
      },
      provenance: function (id) { return request('/api/projects/' + id + '/provenance') },
      stats: function () { return request('/api/stats') },

      /* ---------------- analysis ---------------- */
      latestAnalysis: function (projectId) {
        return request('/api/projects/' + projectId + '/analysis/latest')
      },
      runDemoAnalysis: function (projectId) {
        return request('/api/projects/' + projectId + '/analysis/demo', { method: 'POST' })
      },
      runAnalysis: function (projectId, files, params) {
        var fd = new FormData()
        fd.append('red', files.red)
        fd.append('nir', files.nir)
        if (files.gedi) fd.append('gedi', files.gedi)
        params = params || {}
        Object.keys(params).forEach(function (k) {
          if (params[k] !== undefined && params[k] !== null) fd.append(k, params[k])
        })
        return request('/api/projects/' + projectId + '/analysis', { method: 'POST', body: fd })
      },
      sensitivity: function (projectId) { return request('/api/projects/' + projectId + '/sensitivity') },
      runInvest: function (projectId, files, cellAreaHa) {
        var fd = new FormData()
        fd.append('lulc', files.lulc)
        fd.append('biophysical', files.biophysical)
        if (cellAreaHa) fd.append('cell_area_ha', cellAreaHa)
        return request('/api/projects/' + projectId + '/invest', { method: 'POST', body: fd })
      },
      runDemoInvest: function (projectId) {
        return request('/api/projects/' + projectId + '/invest/demo', { method: 'POST' })
      },
      baselines: function (projectId) { return request('/api/projects/' + projectId + '/invest') },

      /** Direct <img src> for a raster preview; the token rides in the query string. */
      previewUrl: function (projectId, analysisId, kind) {
        return base + '/api/projects/' + projectId + '/analysis/' + analysisId +
          '/preview/' + (kind || 'agc') + '?token=' + encodeURIComponent(getToken() || '')
      },
      downloadUrl: function (projectId, analysisId, kind) {
        return base + '/api/projects/' + projectId + '/analysis/' + analysisId +
          '/download/' + (kind || 'agc') + '?token=' + encodeURIComponent(getToken() || '')
      },

      /* ---------------- verification ---------------- */
      verifierQueue: function () { return request('/api/verifier/queue') },
      verifierStats: function () { return request('/api/verifier/stats') },
      decide: function (projectId, decision, note) {
        return request('/api/projects/' + projectId + '/decision', {
          method: 'POST', body: { decision: decision, note: note || '' }
        })
      },

      /* ---------------- assets ---------------- */
      listAssets: function () { return request('/api/assets') },
      recordAsset: function (projectId, payload) {
        return request('/api/projects/' + projectId + '/assets', { method: 'POST', body: payload })
      },
      simulateAsset: function (projectId, payload) {
        return request('/api/projects/' + projectId + '/assets/simulate', { method: 'POST', body: payload })
      },
      assetMetadata: function (assetId) { return request('/api/assets/' + assetId + '/metadata') },

      /* ---------------- helpers ---------------- */
      formatNumber: function (v, digits) {
        if (v === null || v === undefined || isNaN(Number(v))) return '—'
        return Number(v).toLocaleString('en-US', {
          minimumFractionDigits: digits === undefined ? 2 : digits,
          maximumFractionDigits: digits === undefined ? 2 : digits
        })
      }
    }
  }

  global.BlueChain = { createClient: createClient }
})(typeof window !== 'undefined' ? window : globalThis)
