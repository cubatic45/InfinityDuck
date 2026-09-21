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

var editorPromise;
function loadStyle(href) {
	return new Promise(function(resolve, reject) {
		var existing = document.querySelector('link[href="' + href + '"]');
		if (existing) {
			resolve();
			return;
		}
		var link = E('link', { rel: 'stylesheet', href: href });
		link.onload = resolve;
		link.onerror = function() { reject(new Error('Editor stylesheet could not be loaded')); };
		document.head.appendChild(link);
	});
}

function loadScript(src) {
	return new Promise(function(resolve, reject) {
		var existing = document.querySelector('script[src="' + src + '"]');
		if (existing) {
			resolve();
			return;
		}
		var script = E('script', { src: src });
		script.onload = resolve;
		script.onerror = function() { reject(new Error('Editor script could not be loaded')); };
		document.head.appendChild(script);
	});
}

function ensureEditorStyle() {
	if (document.getElementById('duck-editor-style')) return;
	var style = E('style', { id: 'duck-editor-style' });
	style.textContent = [
		'.duck-editor-toolbar{display:flex;align-items:center;margin:0 0 6px}',
		'.duck-editor-toolbar .btn{margin:0;cursor:pointer}',
		'.CodeMirror{height:500px;border:1px solid var(--border-color-medium,#ccc);font-family:monospace;font-size:13px}',
		'.CodeMirror-gutters{border-right:1px solid var(--border-color-medium,#ccc);background:var(--background-color-low,#f7f7f7)}',
		'.CodeMirror-linenumber{color:var(--text-color-low,#888)}'
	].join('\n');
	document.head.appendChild(style);
}

function loadEditor() {
	if (!editorPromise) {
		var base = L.resource('duck-editor') + '/';
		ensureEditorStyle();
		editorPromise = Promise.all([
			loadStyle(base + 'lib/codemirror.css'),
			loadStyle(base + 'addon/fold/foldgutter.css'),
			loadScript(base + 'lib/codemirror.js').then(function() {
				return loadScript(base + 'addon/edit/matchbrackets.js');
			}).then(function() {
				return loadScript(base + 'addon/fold/foldcode.js');
			}).then(function() {
				return loadScript(base + 'addon/fold/foldgutter.js');
			}).then(function() {
				return loadScript(base + 'addon/fold/indent-fold.js');
			}).then(function() {
				return loadScript(base + 'mode/dae/dae.js');
			})
		]).then(function() {
			if (!window.CodeMirror || !window.CodeMirror.modes.dae)
				throw new Error('CodeMirror dae mode is unavailable');
			return window.CodeMirror;
		}).catch(function(error) {
			editorPromise = null;
			throw error;
		});
	}
	return editorPromise;
}

// Adapted from QiuSimons/luci-app-honk's dae editor formatter.
function formatEditor(editor) {
	editor.operation(function() {
		var cursor = editor.getCursor();
		var prefixes = [
			'geosite', 'geoip', 'keyword', 'full', 'suffix', 'regex', 'domain',
			'pname', 'subtag', 'name', 'mac', 'dip', 'sip', 'dport', 'sport',
			'l4proto', 'ipversion_prefer', 'fallback', 'qtype', 'qname',
			'upstream', 'ip', 'tag', 'inlist'
		];
		var prefixPattern = new RegExp('\\b(' + prefixes.join('|') + ')\\s*:\\s*', 'g');
		var formatSegment = function(segment) {
			return segment
				.replace(/\s*->\s*/g, ' -> ')
				.replace(/\s*&&\s*/g, ' && ')
				.replace(/([^\s])\s*\{/g, '$1 {')
				.replace(/\s*,\s*/g, ', ')
				.replace(prefixPattern, '$1: ');
		};
		var formatLine = function(line) {
			line = line
				.replace(/^(\s*[a-zA-Z0-9_-]+)\s*:\s*(\S.*)$/, '$1: $2')
				.replace(/^(\s*[a-zA-Z0-9_-]+)\s*:\s*$/, '$1:');
			var parts = line.split(/(['"])/);
			var quote = '';
			for (var i = 0; i < parts.length; i++) {
				if (parts[i] === "'" || parts[i] === '"') {
					quote = quote ? (quote === parts[i] ? '' : quote) : parts[i];
				} else if (!quote) {
					var comment = parts[i].indexOf('#');
					if (comment !== -1) {
						var code = formatSegment(parts[i].slice(0, comment));
						parts[i] = code.replace(/\s*$/, code ? ' ' : '') + parts[i].slice(comment).trimEnd();
						parts.splice(i + 1);
						break;
					}
					parts[i] = formatSegment(parts[i]);
				}
			}
			return parts.join('').trimEnd();
		};
		var lines = editor.getValue().split('\n').map(function(line) {
			var trimmed = line.trim();
			if (!trimmed || trimmed.charAt(0) === '#' || trimmed.slice(0, 2) === '//')
				return line.trimEnd();
			return formatLine(line);
		});
		editor.setValue(lines.join('\n'));
		for (var line = 0; line < editor.lineCount(); line++)
			editor.indentLine(line, 'smart');
		editor.setCursor(cursor);
	});
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
		var formatButton = E('button', {
			type: 'button', 'class': 'btn cbi-button', disabled: 'disabled'
		}, _('Format Code'));
		var toolbar = E('div', { 'class': 'duck-editor-toolbar' }, [formatButton]);
		var status = self.status = E('p', { role: 'status', 'aria-live': 'polite' }, _('No unsaved changes'));
		var root = E('div', { 'class': 'cbi-map' }, [
			E('h2', _('Configuration')),
			E('p', _('Configuration is validated before saving. Apply hot-reloads a running service.')),
			status, toolbar, textarea
		]);
		var disposed = false;
		var editor, observer;
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
			clearTimeout(formatButton._resetTimer);
			if (editor) editor.toTextArea();
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
		loadEditor().then(function(CodeMirror) {
			if (disposed) return;
			editor = CodeMirror.fromTextArea(textarea, {
				mode: 'dae', indentUnit: 4, tabSize: 4, lineNumbers: true,
				lineWrapping: true, matchBrackets: true, foldGutter: true,
				readOnly: readOnly,
				gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
			});
			self.editorInstance = editor;
			editor.on('change', update);
			editor.on('inputRead', function(instance, change) {
				if (change.origin !== '+input') return;
				var pairs = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'" };
				var close = pairs[change.text[0]];
				if (!close) return;
				var cursor = instance.getCursor();
				instance.replaceRange(close, cursor);
				instance.setCursor(cursor);
			});
			formatButton.disabled = readOnly;
			formatButton.addEventListener('click', function() {
				try {
					formatEditor(editor);
					update();
					formatButton.textContent = _('Formatted');
					formatButton.classList.add('cbi-button-positive');
					clearTimeout(formatButton._resetTimer);
					formatButton._resetTimer = window.setTimeout(function() {
						formatButton.textContent = _('Format Code');
						formatButton.classList.remove('cbi-button-positive');
					}, 1500);
				} catch (error) {
					ui.addNotification(null, E('p', _('Failed to format code: ') + error.message), 'error');
				}
			});
		}).catch(function(error) {
			if (disposed) return;
			if (editor) editor.toTextArea();
			self.editorInstance = null;
			textarea.style.display = '';
			console.error(error);
			ui.addNotification(null, E('p', _('Advanced editor could not be loaded. You can still edit and save using the text area.')), 'warning');
		});
		return root;
	}
});
