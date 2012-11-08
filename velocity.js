(function(exports) {

	if(typeof require !== 'undefined') {
		var http = require('http');
	}

	(function() {
		if(!''.trim) {
			String.prototype.trim = function() {
				var str = this,
					str = str.replace(/^\s\s*/, ''),
					ws = /\s/,
					i = str.length;
				while(ws.test(str.charAt(--i)));
				return str.slice(0, i + 1);
			}
		}

		if(![].forEach) {
			Array.prototype.forEach = function(func) {
				for(var i = 0, len = this.length; i < len; i++) {
					func && func(this[i], i);
				}
			}
		}

	})();

	var static = {},
		index = 0;

	var defaultConfig = {
		'velocityCount': 'velocityCount',
		'screen_placeholder': 'screen_placeholder'
	},
		tags = ['foreach', 'if', 'elseif', 'else', 'end', 'set', '#', '*', 'include', 'macro'],
		len = (function() {
			var len = 0;
			for(var i = 0; i < tags.length; i++) {
				if(len < tags[i].length) {
					len = tags[i].length;
				}
			}
			return len;
		})();

	function Velocity(tpl, context, config) {
		this.static = {};
		this.index = 0;
		config = config || {};
		this.parent = config.parent;
		this.context = context || {};
		this.request = config.request;
		this.vm_name = config.vm_name;
		this.tpl = tpl;
		this.sub_vm = {};
		this.parse();
	}

	function extend(destination, source) {
		for(var p in source) {
			destination[p] = source[p];
		}
		return destination;
	}

	Velocity.prototype = {
		render: function(context) {
			var self = this;

			if(this.logic_error.length) {
				this.logic_error.forEach(function(item) {
					console.warn(self.vm_name + '  line' + item.line + ':' + item.error);
				});
				return;
			}

			if(!this.compiled) {
				this.compile();
			}
			var _context = extend(this.parse_context(), this.context);
			this.static = static;
			if(context) {
				context = extend(_context, context);
			}

			_context.tmsTool = {
				importRgn: function(url) {
					url = url.replace('"', '');
					self.TaskQueue.add(Task(index, function(task) {
						task.param = {
							template: url
						};
						if(typeof $ !== 'undefined') {
							$.getScript('tms.php?url=' + url, function() {
								task.data = decodeURIComponent(_data.code).replace(/\+/g, ' ');
								_data = '';
								task.finished = true;
							});
						} else {
							http.get("http://localhost/v1/tms.php?type=node&url=" + url, function(res) {
								res.on('data', function(chunk) {
									task.data = chunk.toString();
									task.finished = true;
								});
								res.on("end", function() {
									task.finished = true;
								});
							}).on('error', function(e) {
								task.data = e.message;
								task.finished = true;
								console.log("Got  " + url + " error: " + e.message);
							});
						}
					}).start());
					return '_velocity' + (index++);
				}
			}
			_context.load_screent = function(url) {
				self.TaskQueue.add(Task(index, function(task) {
					task.param = {
						'template': url
					};
					self.request(task.param.template, function(s) {
						task.data = self.parse_subvm(s, {}, task.param.template);
						task.finished = true;
					});
				}).start());
				return '_velocity' + (index++);
			}

			_context.load_control = function(param) {
				self.TaskQueue.add(Task(index, function(task) {
					task.param = param;
					task.parent = self.parent && self.parent.vm_name;
					task.task_name = self.vm_name;
					self.request(task.param.template, function(s) {
						task.data = self.parse_subvm(s, param.data, param.template);
						task.finished = true;
					});
				}).start());
				return '_velocity' + (index++);
			}
			//console.log(this.body);
			//console.log(static);
			try {
				var _html = this.compiled.call(this, _context).split('\n'),
					html = [];
			} catch(e) {
				console.log(this.vm_name);
				console.log(e)
				return ''
			}
			_html.forEach(function(item) {
				if(item.trim()) {
					html.push(item);
				}
			});
			html = html.join('\n');
			static = {};
			index = 0;
			this.html = html;
			if(this.parent) {
				return html;
			}


			this.TaskQueue.addCallback({
				callback: function(queue) {
					queue.forEach(function(item) {
						html = html.replace('_velocity' + item.id, item.data);
					});
				},
				context: this
			});
			this.TaskQueue.start();
			return html;
		},
		parse_subvm: function(tpl, context, vm_name) {
			this.sub_vm[vm_name] = new Velocity(tpl, extend(this.context, context), {
				parent: this,
				request: this.request,
				vm_name: vm_name
			});
			return this.sub_vm[vm_name].render();
		},
		parse_context: function() {
			var context = extend(this.namespace.context, this.context),
				func = null;

			for(var p in context) {
				for(var pp in context) {
					if(p !== pp) {
						if(p.indexOf('.') > -1 && p.indexOf(pp) == 0) {
							delete context[pp];
						} else if(pp.indexOf('.') > -1 && pp.indexOf(p) == 0) {
							delete context[p];
						}
					}
				}
			}

			for(var p in context) {
				if(context.hasOwnProperty(p)) {
					if(p in this.namespace.set) {
						context[p];
						continue;
					}
					var temp = p.replace(/\([^)]?\)/g, '').split('.');
					if(temp.length > 1) {
						if(p.indexOf('(') > -1 && p.indexOf(')') > -1) {
							func = function(a) {
								return a || 'taojie';
							}
							func1 = function() {
								return this;
							}
						}
						if(!context[temp[0]]) {
							context[temp[0]] = {};
						}
						for(var i = 1; i < temp.length; i++) {
							if(temp.length > 2) {
								context[temp[0]][temp[i]] = func ? func1 : temp[i];
							} else {
								context[temp[0]][temp[i]] = func ? func : temp[i];
							}
						}
						func = null;
						delete context[p];
					}
					if(p.search(/[^\w.]/) > -1) {
						delete context[p];
					}
				}
			}
			return context;
		},
		parse: function() {
			var self = this;
			var code = this.tpl,
				start = 0,
				line = 1;
			this.logic_stack = [];
			this.logic_error = [];
			this.sub_vm = {};
			this.namespace = {
				context: {},
				set: {}
			}
			if(this.parent) {
				this.TaskQueue = this.parent.TaskQueue;
			} else {
				this.TaskQueue = new TaskQueue();
			}
			this.code_compile = [];
			this.code_compile.push('var static=this.static;');
			this.code_compile.push('var __temp=[];');
			code.replace(/\n/g, function() {
				var code = self.tpl.substr(start, arguments[1] - start).trim();
				if(code) {
					self.code_compile.push(new LineParser(code, line, self).get_code());
				}
				line++;
				start = arguments[1];
			});
			this.code_compile.push(new LineParser(this.tpl.slice(start), line, this).get_code());
			this.parsed = true;
			return this;
		},
		compile: function() {
			if(!this.parsed) {
				this.parse();
			}
			var body = this.code_compile.join('\n');
			delete this.code_compile;
			body = body + '\n return  __temp.join("\\n");';
			this.body = body;
			this.compiled = new Function("context", body);
			return this;
		}
	}

	Velocity.parse = function(tpl, context) {
		return new this(tpl, context).render();
	}


	function Task(id, job) {
		return {
			id: id,
			started: false,
			finished: false,
			loged: false,
			data: '',
			parent: '',
			param: {},
			start: function() {
				if(this.started) {
					return;
				}
				this.started = true;
				job(this);
				return this;
			}
		}
	}

	function TaskQueue(callback) {
		this.queue = [];
		this.timer = null;
		this.started = false;
		this.finished = false;
		this.callback = [callback];
	}

	TaskQueue.prototype = {
		add: function(task) {
			this.queue.push(task);
		},
		addCallback: function(callback) {
			this.callback.forEach(function(item) {
				if(callback == item) {
					return;
				}
			});
			this.callback.push(callback);
			return this;
		},
		start: function() {
			var self = this;
			if(self.started) {
				return;
			}
			self.started = true;
			this.queue.forEach(function(item) {
				if(!item.started) {
					console.info('task' + item.id + ' has started it\'s job!');
					item.start();
					item.started = true;
				}
			});
			this.checkFinish();
		},
		checkFinish: function() {
			var self = this;
			if(!this.timer) {
				this.timer = setInterval(function() {
					if(self.finished || !self.queue.length) {
						self.finish();
						return;
					}
					self.finished = true;
					for(var i = 0; i < self.queue.length; i++) {
						var item = self.queue[i];
						if(!item.finished) {
							self.finished = false;

							break;
						} else {
							if(!item.loged) {
								console.info('task' + item.id + '(' + item.param.template + ') has finished it\'s job!');
								item.loged = true;
							}
						}
					}
				}, 100);
			}
		},

		finish: function() {
			var self = this;
			clearInterval(this.timer);
			this.callback.forEach(function(item) {
				item && item.callback.call(item.context, self.queue);
			});
		}
	}


	function LineParser(tpl, line, vm) {
		this.line = line;
		this.tpl = tpl;
		this.vm = vm;
		this.code_compile = [];
		this.parse(tpl);
	}
	LineParser.prototype = {
		get_code: function() {
			var _code = [],
				new_code = [],
				logic = false;
			for(var j = 0; j < this.code_compile.length; j++) {
				if(!this.code_compile[j].logic && this.code_compile[j].code.trim()) {
					_code.push(this.code_compile[j].code);
				} else {
					new_code.push('__temp.push(' + _code.join('+') + ');');
					new_code.push(this.code_compile[j].code);
					_code = [];
				}

			}
			if(_code.length) {
				new_code.push('__temp.push(' + _code.join('+') + ');');
			}
			return new_code.join('\n');
		},
		parse: function(code) {
			var self = this,
				new_code;
			code.replace(/[\$#]/, function() {
				new_code = code.slice(arguments[1]);
				if(arguments[0] == '$') {
					if(new_code.indexOf('$control') == 0) {
						var temp = code.substr(0, arguments[1]);
						static[index] = temp;
						self.code_compile.push({
							'code': 'static[' + (index++) + ']',
							'logic': false
						});
						return self.parse_control(code);
					}
					if(new_code.search(/^\$!?{?[\w_]+}?/) == 0) {
						var temp = code.substr(0, arguments[1]);
						static[index] = temp;
						self.code_compile.push({
							'code': 'static[' + (index++) + ']',
							'logic': false
						});
						return self.parse_var(new_code);
					}
				}
				var flag = false;
				for(var i = 0; i < tags.length; i++) {
					if(new_code.substr(1).indexOf(tags[i]) == 0) {
						var temp = code.substr(0, arguments[1]);
						static[index] = temp;
						self.code_compile.push({
							'code': 'static[' + (index++) + ']',
							'logic': false
						});
						var method = 'parse_' + tags[i]
						if(self[method]) {
							self[method](new_code, self);
						} else {
							if(tags[i] == '*') {
								//self.note=!self.note;
							}
						}
						flag = true;
						break;
					}
				}
				if(!flag) {
					static[index] = code.substr(0, arguments[1] + 1);
					self.code_compile.push({
						'code': 'static[' + (index++) + ']',
						'logic': false
					});
					self.parse(new_code.slice(1));
				}
			});
			if(new_code) {
				return;
			}
			if(!code.trim()) {
				return;
			}
			static[index] = code;
			self.code_compile.push({
				'code': 'static[' + (index++) + ']',
				'logic': false
			});
			return code;
		},
		parse_foreach: function(code) {
			var brackets = [],
				stop = false,
				start = -1,
				end, new_code, _code = [],
				find = false;
			code.replace(/\(|\)/g, function() {
				find = true;
				if(stop) return;
				if(arguments[0] == '(') {
					brackets.push({
						'code': '(',
						'col': arguments[1]
					});
					if(start == -1) {
						start = arguments[1];
					}
				}
				if(arguments[0] == ')') {
					if(!brackets.pop()) {
						self.vm.logic_error.push({
							line: self.line,
							error: 'tag foreach missing "(" !'
						});
					}
					end = arguments[1];
					if(brackets.length == 0) {
						stop = true;
					}
				}
			});

			if(!find) {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag foreach doesn\'t have a conditional expression !'
				});
				var temp = '$error in $error';

			} else if(brackets) {
				brackets.forEach(function(item) {
					self.vm.logic_error.push({
						line: self.line,
						error: 'tag foreach has an unexpected "' + item.code + '" in col ' + item.col + ' !'
					});
				});
				var temp = code.substr(start + 1, end - 1 - start);
			} else {
				var temp = code.substr(start + 1, end - 1 - start);
			}
			if(!temp) {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag foreach doesn\'t have a conditional expression !'
				});
				new_code = ['$error', '$error'];
			} else {
				new_code = temp.split(/\sin\s+?/);
				if(new_code.length == 1) {
					self.vm.logic_error.push({
						line: self.line,
						error: 'tag foreach doesn\'t have  key word "in" in the conditional expression !'
					});
					new_code = ['$error', '$error'];
				} else if(new_code.length > 2) {
					self.vm.logic_error.push({
						line: self.line,
						error: 'tag foreach has an error in the conditional expression !'
					});
					new_code = ['$error', '$error'];
				}
				new_code.forEach(function(value, key) {
					if(value.trim().indexOf('$') && value.trim().indexOf('[')) {
						self.vm.logic_error.push({
							line: self.line,
							error: 'tag foreach missing "$" before the variable "' + value + '" in the conditional expression !'
						});
					}
				});
			}

			var key = new_code[0].trim().replace(/^\$!?/, ''),
				list = new_code[1].trim();
			if(new_code[1].charAt(0) == '[') {
				list = list.substr(1, list.length - 2);
				list = list.split('..');
			}
			var self = this;
			if(({}).toString.call(list) == '[object Array]') {
				new_code = 'for(var i=' + parseInt(list[0]) + ';i<' + parseInt(list[1]) + ';i++){\nvar ' + key + '=i;';
			} else {
				list = list.replace(/^\$!?/, '');
				self.vm.namespace.context[key] = {};
				self.vm.namespace.set[key] = key;
				self.vm.namespace.context[list] = [self.vm.namespace.context[key]];
				new_code = 'for(var i=0;i<context.' + list + '.length;i++){\nvar ' + key + '=context.' + list + '[i];';
			}
			self.code_compile.push({
				'code': new_code,
				'logic': true
			});
			self.vm.logic_stack.push({
				'logic': 'foreach',
				'line': self.line
			});
			if(end) {
				code = code.slice(end + 1);
			} else {
				code = ''
			}
			self.parse(code);
		},
		parse_if: function(code, tag) {
			tag = tag || 'if';
			var self = this;
			brackets = [], stop = false, start = -1, end = 0, _code = [], new_code = '', find = false;
			code.replace(/\(|\)/g, function() {
				find = true;
				if(stop) return;
				if(arguments[0] == '(') {
					if(start == -1) {
						start = arguments[1];
					}
					brackets.push({
						'code': '(',
						'col': arguments[1]
					});
				}
				if(arguments[0] == ')') {
					if(!brackets.pop()) {
						self.vm.logic_error.push({
							line: self.line,
							error: 'tag if missing "(" !'
						});
					}
					end = arguments[1];
					if(brackets.length == 0) {
						stop = true;
					}
				}
			});
			if(!find || !end) {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag ' + tag + ' doesn\'t have a conditional expression !'
				});
				code = 'error';
			} else {
				if(brackets) {
					brackets.forEach(function(item) {
						self.vm.logic_error.push({
							line: self.line,
							error: 'tag ' + tag + ' an unexpected "' + item.code + '" in line ' + (self.line + 1) + 'col ' + item.col + ' !'
						});
					});
				}

				new_code = code.slice(end + 1);
				var old_code = code;
				code = code.substr(start + 1, end - 1 - start);

				if(!code) {
					self.vm.logic_error.push({
						line: self.line,
						error: 'tag ' + tag + ' doesn\'t have a conditional expression !'
					});
					code = 'error';
				}
			}
			var temp = self.parse_brackets(code);

			if(tag == 'macro') {
				self.code_compile.push({
					'code': old_code.substr(1, start - 1) + "(" + temp + ")",
					'logic': false
				});
			} else if(tag == 'elseif') {
				self.code_compile.push({
					'code': '}else if(' + temp + '){',
					'logic': true
				});
			} else {
				self.code_compile.push({
					'code': 'if(' + temp + '){',
					'logic': true
				});
				self.vm.logic_stack.push({
					'logic': 'if',
					'line': self.line
				});
			}

			if(new_code) {
				self.parse(new_code);
			}
		},
		parse_macro: function(code) {
			var self = this;
			var start = code.indexOf('('),
				end = code.indexOf(')');
			var new_code = code.substr(start + 1, end - start - 1).split(/\s+/);
			var fuc_name = new_code[0].trim(),
				func_arg = new_code[1].trim().replace(/\$!?/, '');
			self.vm.namespace.set[func_arg] = func_arg;
			tags.push(fuc_name);
			self.vm.logic_stack.push({
				logic: 'macro',
				line: self.line
			})
			self['parse_' + fuc_name] = function(code) {
				self.parse_if(code, 'macro')
			};
			self.code_compile.push({
				'code': 'function ' + fuc_name + '(' + func_arg + '){',
				'logic': true
			});
			if(code.slice(end + 1)) {
				self.parse(code.slice(end + 1));
			}
		},
		parse_else: function(code) {
			var _code = [];
			this.code_compile.push({
				'code': '}else{',
				'logic': true
			});
			if(code.length > 4) {
				_code.push(this.parse(code.slice(code.indexOf('else') + 4)));
			}
			return _code.join('\n');
		},
		parse_elseif: function(code) {
			this.parse_if(code, 'elseif');
		},
		parse_end: function(code, self) {
			this.code_compile.push({
				'code': '}',
				'logic': true
			});
			var temp = this.vm.logic_stack.pop();
			if(!temp) {
				this.vm.logic_error.push({
					line: this.line,
					error: 'unexpected tag end!'
				});
			}
			this.parse(code.slice(code.indexOf('end') + 3));
			return null;
		},
		parse_varname: function(code) {
			var self = this;
			code = code.replace(/\$!?{?([\w._]+)}?/g, function() {
				var key = arguments[1].trim();
				if(!(key in self.vm.namespace.set)) {
					self.vm.namespace.context[key] = key;
					return 'context.' + key;
				}
				return key;
			});
			if(code.split('.').length > 2) {
				self.vm.namespace.context[code.replace('context.', '')] = code;
			}
			return code;
		},
		parse_set: function(code) {
			var brackets = [],
				stop = false,
				start = -1,
				end, new_code, _code = [],
				find = false;
			var self = this;
			code.replace(/\(|\)/g, function() {
				find = true;
				if(stop) return;
				if(arguments[0] == '(') {
					if(start == -1) {
						start = arguments[1];
					}
					brackets.push({
						'code': '(',
						'col': arguments[1]
					});
				}
				if(arguments[0] == ')') {
					if(!brackets.pop()) {
						self.vm.logic_error.push({
							line: self.line,
							error: 'tag set missing "(" !'
						});
					}
					end = arguments[1];
					if(brackets.length == 0) {
						stop = true;
					}
				}
			});
			if(!find) {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag set doesn\'t have a conditional expression !'
				});
				new_code = '$error="error"';
			} else if(!end) {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag set doesn\'t expect ")" in the  conditional expression !'
				});
				new_code = '$error="error"';
			} else if(brackets.length) {
				brackets.forEach(function(item) {
					self.vm.logic_error.push({
						line: self.line,
						error: 'tag if an unexpected "' + item.code + '" in col ' + item.col + ' !'
					});
				});
				new_code = '$error="error"';
			} else {
				new_code = code.substr(start + 1, end - 1 - start);
			}
			new_code = new_code.trim();

			if(new_code.indexOf('=') == -1) {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag doesn\'t expect a "=" in the conditional expression !'
				});
				new_code += '="error"';
			}
			var key = new_code.substr(0, new_code.indexOf('=')).trim(),
				value = new_code.slice(new_code.indexOf('=') + 1).trim();
			if(key.charAt(0) !== '$') {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag set missing "$" before the variable "' + key + '" in the conditional expression !'
				});
			}
			if(!value) {
				self.vm.logic_error.push({
					line: self.line,
					error: 'tag set doesn\'t have a correct value for "' + key + '" in the conditional expression !'
				});
				value = '"error"';
			}
			key = key.replace(/^\$!?/, '');
			self.vm.namespace.set[key] = key;
			self.code_compile.push({
				code: 'var ' + key + "=" + self.parse_brackets(value) + ';',
				'logic': true
			})
			var temp = code.slice(end + 1);
			if(temp) {
				self.parse(temp);
			}
		},
		parse_include: function(code) {
			return '__temp.push(' + code.replace('include', 'context.include') + ')';
		},
		parse_quote: function(code) {
			var _code = [],
				new_code = '';
			var self = this;
			code = code.trim();
			while(code.indexOf('$') > -1) {
				code.replace(/\$!?{?[\w_.]+}?/, function() {
					static[index] = code.substr(0, arguments[1]).replace(/^"/, '').replace(/"$/, '');
					_code.push('static[' + (index++) + ']');
					var temp = self.parse_varname(arguments[0]);
					code = code.slice(arguments[0].length + arguments[1]).trim();
					if(code.charAt(0) == '(') {
						var brackets = [],
							stop = false,
							start = -1,
							end = 0;
						code.replace(/\(|\)/g, function() {
							if(stop) return;
							if(arguments[0] == '(') {
								if(start == -1) {
									start = arguments[1];
								}
								brackets.push('(');
							}
							if(arguments[0] == ')') {
								brackets.pop();
								end = arguments[1];
								if(brackets.length == 0) {
									stop = true;
								}
							}
						});

						var new_code = code,
							last = '';
						temp = temp + code.substr(0, end + 1);
						code = code.slice(end + 1).trim();

						start = -1, end = 0;
						while(code.charAt(0) == '.') {
							var brackets = [],
								stop = false;
							start = -1, end = 0;
							code.replace(/\(|\)/g, function() {
								if(stop) return;
								if(arguments[0] == '(') {
									if(start == -1) {
										start = arguments[1];
									}
									brackets.push('(');
								}
								if(arguments[0] == ')') {
									brackets.pop();
									end = arguments[1];
									if(brackets.length == 0) {
										stop = true;
									}
								}
							});
							var last = code;
							code = code.slice(end + 1).trim();
						}

						if(end) {
							last = last.substr(0, last.indexOf(code));
							var start = new_code.indexOf(last);
							temp + new_code.substr(0, start)
						}
					}
					new_code = self.parse_brackets(temp);
					_code.push(new_code);
					//console.info(code);
				});
			}

			var temp = code.trim();
			if(temp) {
				temp = temp.replace(/"$/, '').replace(/^"/, '').replace(/"$/, '');
				if(temp) {
					static[index] = temp;
					_code.push('static[' + (index++) + ']');
				}
			}
			return _code.join('+');
		},
		parse_brackets: function(code) {
			// if(code.indexOf('importRgn')>-1){
			// 	    console.info(code);
			// 	    //importRgn("/rgn/mcdull/hots.php",1)
			// 	    code=code.replace(/(?:,(\w+)\))/,function(){
			// 	    	console.info(arguments);
			// 	    	return ',this)';
			// 	    })
			// 	}
			if(code.indexOf('$') == -1) {
				return code
			}

			var self = this;

			if(code.search(/['"]/) == -1) {
				return code.replace(/\$!?{?([\w._]+)}?/g, function() {
					if(!(arguments[1].trim() in self.vm.namespace.set)) {
						self.vm.namespace.context[arguments[1].trim()] = arguments[1];
						return 'context.' + arguments[1];
					}
					return arguments[1];
				});
			}
			var flag = true,
				start = 0,
				end = -1,
				position = [0],
				data = [];

			var _code = [],
				flag = true;
			while(code) {
				var find = false;
				code.replace(/[\$"]/, function() {
					find = true;
					if(arguments[0] == '"') {
						if(arguments[1]) {
							_code.push(code.substr(0, arguments[1]));
							code = code.slice(arguments[1])
						}
						var end = code.indexOf('"', 1);
						_code.push(self.parse_quote(code.substr(0, end + 1), self));
						code = code.slice(end + 1);
					} else {
						var start = 1;
						_code.push(code.substr(0, arguments[1]));
						code = code.slice(arguments[1]);
						code.replace(/^\$!?{?[\w_.]+}?/, function() {
							start = arguments[0].length;
							_code.push(self.parse_varname(arguments[0]));
						});
						code = code.slice(start);
					}
				});
				if(!find) {
					_code.push(code);
					code = ''
				}
			}
			code = _code.join('');
			var temp = code.split(/(?:\))(?!\s*\.)/);
			if(temp.length > 1) {
				temp = temp[0] + ')';
			} else {
				temp = temp[0];
			}
			self.vm.namespace.context[temp.replace('context.', '')] = code;
			return code;
		},
		parse_var: function(code) {
			// code=code+" ";
			var self = this;
			if(code.indexOf('$' + defaultConfig.screen_placeholder) > -1) {
				self.code_compile.push({
					code: 'context.load_screent("' + self.vm.vm_name.replace('layout', 'screen') + '")',
					logic: false
				});
				code = code.replace('$' + defaultConfig.screen_placeholder, '').trim();
				return self.parse(code);
			}
			var _code = [],
				end, start, temp, more = false;
			if(code.search(/^\$!?{/) > -1) {
				start = code.indexOf('}');
				more = true;
			} else {
				code.replace(/^\$!?{?([\w._]+)}?/, function() {
					start = arguments[0].length;
				});
			}
			temp = self.parse_varname(code.substr(0, start));
			code = code.slice(start).trim();
			if(code.charAt(0) == '(') {

				var brackets = [],
					stop = false,
					start = -1,
					end = 0;
				code.replace(/\(|\)/g, function() {
					if(stop) return;
					if(arguments[0] == '(') {
						if(start == -1) {
							start = arguments[1];
						}
						brackets.push('(');
					}
					if(arguments[0] == ')') {
						brackets.pop();
						end = arguments[1];
						if(brackets.length == 0) {
							stop = true;
						}
					}
				});

				var new_code = code,
					last = '';
				temp = temp + code.substr(0, end + 1);
				code = code.slice(end + 1).trim();

				start = -1, end = 0;
				while(code.charAt(0) == '.') {
					var brackets = [],
						stop = false;
					start = -1, end = 0;
					code.replace(/\(|\)/g, function() {
						if(stop) return;
						if(arguments[0] == '(') {
							if(start == -1) {
								start = arguments[1];
							}
							brackets.push('(');
						}
						if(arguments[0] == ')') {
							brackets.pop();
							end = arguments[1];
							if(brackets.length == 0) {
								stop = true;
							}
						}
					});
					var last = code;
					code = code.slice(end + 1).trim();
				}
				new_code = self.parse_varname(temp);
				if(end) {
					last = last.substr(0, last.indexOf(code));
					new_code = new_code + last;
				}
				self.vm.namespace.context[new_code.replace('context.', '')] = new_code;
				self.code_compile.push({
					'code': new_code,
					'logic': false
				});

				self.parse(code);
				return temp;
			} else {
				if(temp && !temp.indexOf('context.') == 0) {
					temp = '(' + temp + '||"")';
				}
				self.code_compile.push({
					'code': temp,
					'logic': false
				});
				if(code) {
					if(more && code.indexOf('}') == 0) {
						code = code.slice(1);
					}
					self.parse(code);
				}
			}
			return _code.join('\n');

		},
		parse_control: function(code) {
			var self = this;
			var param = {
				parse: true,
				data: {}
			},
				args;
			code.replace(/'|"/g, '').replace(/\(([^)]+)\)/g, function() {
				args = arguments[1].split(',');
				args[0] = args[0].trim();
				if(args.length == 1) {
					param['template'] = args[0];
				} else {
					param.data[args[0]] = args[1].trim();
				}
			});



			self.code_compile.push({
				'code': 'context.load_control(' + JSON.stringify(param) + ')',
				'logic': false
			});

		},
		parse_notes: function(code, self) {
			if(self.note) {
				code = '<!--' + code.replace(/^#\*/, '');
			}
			self.code_data.push({
				'code': code,
				'logic': false
			});
			return null
		}
	};

	exports.Velocity = Velocity;

})(typeof exports !== 'undefined' ? exports : window)