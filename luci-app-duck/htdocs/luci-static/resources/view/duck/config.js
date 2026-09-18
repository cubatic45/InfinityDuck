// SPDX-License-Identifier: Apache-2.0
'use strict';
'require fs';
'require ui';
'require view';
'require rpc';

var callSave = rpc.declare({
	object: 'duck.config',
	method: 'save',
	params: ['content', 'apply'],
	reject: true
});
var callStatus = rpc.declare({
	object: 'duck.config',
	method: 'status',
	params: ['job'],
	reject: true
});

// Shared imports, without installing an AMD loader in LuCI's global namespace.
var editorPromise;
function loadEditor() {
	if (!editorPromise) {
		var base = L.resource('monaco-editor') + '/';
		var language = (document.documentElement.lang || 'en').toLowerCase().replace(/_/g, '-');
		var locale = /^(zh-tw|zh-hk|zh-hant)/.test(language) ? 'zh-tw' : /^zh/.test(language) ? 'zh-cn' : null;
		var css = E('link', { rel: 'stylesheet', href: base + 'editor.css' });
		var cssReady = new Promise(function(resolve, reject) {
			css.onload = resolve;
			css.onerror = function() { reject(new Error('Editor stylesheet could not be loaded')); };
		});
		document.head.appendChild(css);
		window.MonacoEnvironment = {
			getWorker: function() { return new Worker(base + 'editor.worker.js'); }
		};
		editorPromise = Promise.all([
			cssReady,
			(locale ? import(base + locale + '.js') : Promise.resolve()).then(function() {
				return import(base + 'editor.js');
			})
		]).then(function(result) {
			var monaco = result[1];
			monaco.languages.register({ id: 'duck' });
			monaco.languages.setMonarchTokensProvider('duck', {
				tokenizer: {
					root: [
						[/#.*$/, 'comment'],
						[/\/\*/, 'comment', '@comment'],
						[/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, 'string'],
						[/->|&&|!/, 'operator'],
						[/[{}()[\]]/, 'delimiter.bracket'],
						[/[a-zA-Z_][\w\/\\^*.+\-=@$!#%]*:/, 'attribute'],
						[/[a-zA-Z_][\w\/\\^*.+\-=@$!#%]*/, 'variable']
					],
					comment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']]
				}
			});
			monaco.languages.setLanguageConfiguration('duck', {
				comments: { lineComment: '#' },
				brackets: [['{', '}'], ['[', ']'], ['(', ')']],
				autoClosingPairs: [
					{ open: '{', close: '}', notIn: ['string', 'comment'] },
					{ open: '[', close: ']', notIn: ['string', 'comment'] },
					{ open: '(', close: ')', notIn: ['string', 'comment'] },
					{ open: "'", close: "'", notIn: ['string', 'comment'] },
					{ open: '"', close: '"', notIn: ['string', 'comment'] }
				]
			});
			return monaco;
		}).catch(function(error) {
			css.remove();
			editorPromise = null;
			throw error;
		});
	}
	return editorPromise;
}

return view.extend({
	load: function() {
		return fs.read_direct('/etc/duck/config.dae', 'text').catch(function(error) {
			if (error.name !== 'NotFoundError') throw error;
			return fs.read_direct('/etc/duck/example.dae', 'text').catch(function(error) {
				if (error.name !== 'NotFoundError') throw error;
				return '';
			});
		});
	},

	getValue: function() {
		return this.editorInstance ? this.editorInstance.getValue() : this.textarea.value;
	},

	updateDirty: function() {
		this.dirty = this.getValue() !== this.savedValue;
		this.status.textContent = this.dirty ? _('Unsaved changes') : _('No unsaved changes');
	},

	save: function(apply) {
		var self = this;
		if (self.saving) return self.saving;
		var value = self.getValue();
		if (!value.trim()) {
			ui.addNotification(null, E('p', _('Configuration cannot be empty!')), 'error');
			return Promise.resolve();
		}
		// The daemon is the authority for syntax, strings, comments and includes.
		// No cached frontend markers can block a corrected configuration.
		self.status.textContent = _('Validating configuration…');
		var deadline = Date.now() + 120000;
		function checkResult(result) {
			if (!result || typeof result.saved !== 'boolean' || typeof result.applied !== 'boolean' || typeof result.error !== 'string')
				throw new Error(_('Unexpected configuration service response'));
			if (result.saved) {
				self.savedValue = value;
				self.updateDirty();
			}
			if (result.error) throw new Error(result.error);
			if (result.pending) {
				if (!/^[a-zA-Z0-9]{6}$/.test(result.job || ''))
					throw new Error(_('Unexpected configuration service response'));
				if (Date.now() >= deadline)
					throw new Error(_('Unable to confirm completion. Reload the page to check configuration and service status.'));
				self.status.textContent = result.saved ? _('Applying configuration…') : _('Validating configuration…');
				return new Promise(function(resolve) { window.setTimeout(resolve, 500); })
					.then(function() { return callStatus(result.job); }).then(checkResult);
			}
			if (!result.saved || (apply && !result.applied))
				throw new Error(_('Configuration was not applied'));
			ui.addNotification(null, E('p', apply ? _('Configuration saved and applied.') : _('Configuration saved.')), 'info');
		}
		self.saving = callSave(value, apply).then(checkResult).catch(function(error) {
			ui.addNotification(null, E('p', error.message), 'error');
		}).finally(function() {
			self.saving = null;
			self.updateDirty();
		});
		return self.saving;
	},

	handleSave: function() { return this.save(false); },
	handleSaveApply: function() { return this.save(true); },
	handleReset: function() {
		if (this.editorInstance) this.editorInstance.setValue(this.savedValue);
		else this.textarea.value = this.savedValue;
		this.updateDirty();
	},

	disposeEditor: function() {
		if (this.cleanup) this.cleanup();
	},

	render: function(content) {
		var self = this;
		self.disposeEditor();
		self.savedValue = content;
		self.dirty = false;
		var readOnly = !L.hasViewPermission();
		var textarea = self.textarea = E('textarea', {
			'class': 'cbi-input-textarea', 'aria-label': _('Configuration'),
			style: 'width:100%;height:500px;font-family:monospace', spellcheck: 'false'
		});
		textarea.value = content;
		textarea.readOnly = readOnly;
		var container = E('div', { style: 'height:500px;width:100%;display:none' });
		var status = self.status = E('p', { role: 'status', 'aria-live': 'polite' }, _('No unsaved changes'));
		var root = E('div', { 'class': 'cbi-map' }, [
			E('h2', _('Configuration')),
			E('p', _('Configuration is validated before saving. Apply hot-reloads a running service.')),
			status, textarea, container
		]);
		var disposed = false;
		var editor, model, subscription, observer, darkMode, themeChange;
		var update = function() { self.updateDirty(); };
		var beforeUnload = function(event) {
			if (self.dirty || self.saving) { event.preventDefault(); event.returnValue = ''; }
		};
		textarea.addEventListener('input', update);
		window.addEventListener('beforeunload', beforeUnload);
		self.cleanup = function() {
			if (disposed) return;
			disposed = true;
			textarea.removeEventListener('input', update);
			window.removeEventListener('beforeunload', beforeUnload);
			window.removeEventListener('pagehide', onPageHide);
			if (observer) observer.disconnect();
			if (darkMode && themeChange) darkMode.removeEventListener('change', themeChange);
			if (subscription) subscription.dispose();
			if (editor) editor.dispose();
			if (model) model.dispose();
			self.editorInstance = null;
		};
		// Preserve live editors when the browser stores the page in its back cache.
		var onPageHide = function(event) { if (!event.persisted) self.cleanup(); };
		window.addEventListener('pagehide', onPageHide);
		var mounted = false;
		observer = new MutationObserver(function() {
			if (root.isConnected) mounted = true;
			else if (mounted) self.cleanup();
		});
		observer.observe(document.body, { childList: true, subtree: true });
		loadEditor().then(function(monaco) {
			if (disposed) return;
			darkMode = window.matchMedia('(prefers-color-scheme: dark)');
			model = monaco.editor.createModel(textarea.value, 'duck');
			container.style.display = '';
			editor = monaco.editor.create(container, {
				model: model, theme: darkMode.matches ? 'vs-dark' : 'vs',
				readOnly: readOnly, automaticLayout: true, minimap: { enabled: false },
				scrollBeyondLastLine: false, tabSize: 4, wordWrap: 'on'
			});
			self.editorInstance = editor;
			textarea.style.display = 'none';
			subscription = editor.onDidChangeModelContent(update);
			themeChange = function(event) { monaco.editor.setTheme(event.matches ? 'vs-dark' : 'vs'); };
			darkMode.addEventListener('change', themeChange);
		}).catch(function() {
			if (disposed) return;
			if (editor) editor.dispose();
			if (model) model.dispose();
			self.editorInstance = null;
			container.style.display = 'none';
			textarea.style.display = '';
			ui.addNotification(null, E('p', _('Advanced editor could not be loaded. You can still edit and save using the text area.')), 'warning');
		});
		return root;
	}
});
