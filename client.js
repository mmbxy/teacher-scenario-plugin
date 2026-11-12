window.__ModuleLoader__.load({
  id: 'teacher-scenario-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const HISTORY_KEY = 'teacher.kit.history.v1';

    function promptFor(values) {
      const topic = values.topic.trim() || '函数求导';
      if (values.type === 'lesson') {
        return '使用 teacher_generate_lesson 生成《' + topic + '》的可交互讲解页、讲义与 6 道基础练习题。';
      }
      const editionText = values.edition === 'teacher' ? '教师版' : values.edition === 'student' ? '学生版' : '教师版与学生版';
      return '使用 teacher_generate_lecture_kit 生成《' + topic + '》的 ' + values.duration + ' 分钟课时包。'
        + '参数：durationMinutes=' + values.duration
        + '；edition=' + values.edition
        + '；exerciseCount=' + values.exerciseCount
        + '；teachingMode=' + values.teachingMode
        + '；courseLevel=' + values.courseLevel
        + '；withDocx=' + values.withDocx
        + '；withPptx=' + values.withPptx
        + '；withHtml=' + values.withHtml
        + '。需要教案、讲义、练习、板书、互动，导出' + editionText + '。';
    }

    function collectStrings(value, out) {
      if (typeof value === 'string') {
        out.push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => collectStrings(item, out));
        return;
      }
      if (value && typeof value === 'object') {
        Object.values(value).forEach((item) => collectStrings(item, out));
      }
    }

    function parseResult(session) {
      if (!session || !session.eventSource) return { lessonId: '', artifacts: [], error: '' };
      let entries = [];
      try {
        entries = session.eventSource.getSnapshot().entries || [];
      } catch {
        entries = [];
      }
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        const event = entry && entry.event ? entry.event : entry;
        if (!event || event.type !== 'tool/result') continue;
        const texts = [];
        collectStrings(event.data, texts);
        const text = texts.join('\n');
        const lessonMatch = text.match(/函数求导-\d{8,}-\d+min/);
        const pathMatches = text.match(/[A-Za-z]:[\\/][^\s"'<>]+?\.(?:md|docx|pptx|html)/g) || [];
        if (!lessonMatch && pathMatches.length === 0) {
          if (/TEMPLATE_MISSING|TEMPLATE_INCOMPLETE|VALIDATION_FAILED/.test(text)) {
            return { lessonId: '', artifacts: [], error: text.replace(/\s+/g, ' ').slice(0, 160) };
          }
          continue;
        }
        const seen = new Set();
        const artifacts = [];
        pathMatches.forEach((item) => {
          const normalized = item.replace(/\\\\/g, '\\');
          const key = normalized.replace(/\\/g, '/');
          if (seen.has(key)) return;
          seen.add(key);
          artifacts.push(normalized);
        });
        return { lessonId: lessonMatch ? lessonMatch[0] : '', artifacts, error: '' };
      }
      return { lessonId: '', artifacts: [], error: '' };
    }

    function loadHistory() {
      try {
        const value = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
        return Array.isArray(value) ? value.slice(0, 20) : [];
      } catch {
        return [];
      }
    }

    function saveHistory(items) {
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
      } catch {
        // 本地存储不可用时，历史仅保留在当前页面。
      }
    }

    function LessonDock({ client }) {
      const [topic, setTopic] = React.useState('函数求导');
      const [type, setType] = React.useState('kit');
      const [duration, setDuration] = React.useState('60');
      const [edition, setEdition] = React.useState('both');
      const [teachingMode, setTeachingMode] = React.useState('讲授');
      const [courseLevel, setCourseLevel] = React.useState('本科基础');
      const [exerciseCount, setExerciseCount] = React.useState('8');
      const [withDocx, setWithDocx] = React.useState(true);
      const [withPptx, setWithPptx] = React.useState(true);
      const [withHtml, setWithHtml] = React.useState(true);
      const [advanced, setAdvanced] = React.useState(false);
      const [copied, setCopied] = React.useState(false);
      const [sending, setSending] = React.useState(false);
      const [cooldown, setCooldown] = React.useState(false);
      const [status, setStatus] = React.useState({ kind: 'idle', text: '' });
      const [detailsOpen, setDetailsOpen] = React.useState(false);
      const [detailTab, setDetailTab] = React.useState('result');
      const [history, setHistory] = React.useState(loadHistory);
      const sessionRef = React.useRef(null);
      const unsubscribeRef = React.useRef(null);
      const historyIdRef = React.useRef(null);

      const values = {
        topic, type, duration, edition, teachingMode, courseLevel,
        exerciseCount: Number(exerciseCount), withDocx, withPptx, withHtml
      };

      const updateHistory = React.useCallback((updater) => {
        setHistory((previous) => {
          const next = typeof updater === 'function' ? updater(previous) : updater;
          saveHistory(next);
          return next;
        });
      }, []);

      const clearHistory = React.useCallback(() => {
        if (window.confirm('清空本浏览器里的备课历史？此操作不可撤销。')) {
          updateHistory([]);
        }
      }, [updateHistory]);

      React.useEffect(() => () => {
        if (unsubscribeRef.current) unsubscribeRef.current();
        if (sessionRef.current && sessionRef.current.release) {
          try { sessionRef.current.release(); } catch { /* noop */ }
        }
      }, []);

      const copy = React.useCallback(async () => {
        const text = promptFor(values);
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const area = document.createElement('textarea');
          area.value = text;
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }, [values]);

      const scan = React.useCallback((session) => {
        const parsed = parseResult(session);
        if (parsed.error) {
          setStatus({ kind: 'failed', text: '生成失败：' + parsed.error, lessonId: '', artifacts: [] });
          updateHistory((previous) => previous.map((item) => item.id === historyIdRef.current
            ? { ...item, status: 'failed', error: parsed.error }
            : item));
          return true;
        }
        if (parsed.lessonId || parsed.artifacts.length > 0) {
          setStatus({ kind: 'completed', text: '已生成 ' + (parsed.artifacts.length || 16) + ' 件', lessonId: parsed.lessonId, artifacts: parsed.artifacts });
          updateHistory((previous) => previous.map((item) => item.id === historyIdRef.current
            ? { ...item, status: 'completed', lessonId: parsed.lessonId, artifacts: parsed.artifacts }
            : item));
          return true;
        }
        return false;
      }, [updateHistory]);

      const send = React.useCallback(async () => {
        const cleanTopic = topic.trim();
        if (!cleanTopic) {
          setStatus({ kind: 'failed', text: '请先填写知识点。' });
          return;
        }
        if (type === 'kit') {
          const count = Number(exerciseCount);
          if (!Number.isInteger(count) || count < 1 || count > 20) {
            setStatus({ kind: 'failed', text: '题量需要填写 1–20 的整数。' });
            return;
          }
        }
        if (!client || !client.sessions) {
          setStatus({ kind: 'failed', text: '当前页面没有会话服务，请刷新后重试。' });
          return;
        }

        setSending(true);
        setStatus({ kind: 'sending', text: '正在发送…' });
        try {
          const rows = Object.values(client.sessions.list.getSnapshot().byId);
          const row = rows.find((item) => (item.retainedBy && item.retainedBy.mainView ? item.retainedBy.mainView : 0) > 0) || rows[0];
          if (!row || !row.id) {
            setStatus({ kind: 'failed', text: '未找到当前会话，请刷新页面后重试。' });
            return;
          }

          if (unsubscribeRef.current) unsubscribeRef.current();
          if (sessionRef.current && sessionRef.current.release) {
            try { sessionRef.current.release(); } catch { /* noop */ }
          }

          const reference = client.sessions.retain(row.id, { source: 'teacher-kit-panel' });
          sessionRef.current = reference;
          const binding = await reference.ready;
          const session = binding.session;

          const onUpdate = () => {
            if (scan(session)) return;
            let running = false;
            try { running = session.getSnapshot().running === true; } catch { running = false; }
            if (running && status.kind !== 'completed') {
              setStatus({ kind: 'running', text: '执行中…' });
            }
          };
          const unsubEvent = session.eventSource ? session.eventSource.subscribe(onUpdate) : () => {};
          const unsubSession = typeof session.subscribe === 'function' ? session.subscribe(onUpdate) : () => {};
          unsubscribeRef.current = () => { unsubEvent(); unsubSession(); };

          const recordId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7);
          historyIdRef.current = recordId;
          updateHistory((previous) => [{
            id: recordId,
            createdAt: new Date().toISOString(),
            topic: cleanTopic,
            duration,
            edition,
            exerciseCount: values.exerciseCount,
            status: 'queued',
            lessonId: '',
            artifacts: []
          }, ...previous].slice(0, 20));

          const text = promptFor(values);
          const result = await binding.session.prompt([{ type: 'text', text }], 'queue');
          if (result && result.ok) {
            setStatus({ kind: 'queued', text: '已发送，等待执行' });
            setCooldown(true);
            window.setTimeout(() => setCooldown(false), 20000);
            onUpdate();
          } else {
            const reason = result && result.error ? result.error.code || result.error.message : '未知错误';
            setStatus({ kind: 'failed', text: '发送失败：' + reason + '，可以重试。' });
            updateHistory((previous) => previous.map((item) => item.id === recordId ? { ...item, status: 'failed' } : item));
          }
        } catch (error) {
          setStatus({ kind: 'failed', text: '发送失败：' + (error && error.message ? error.message : String(error)) + '，可以重试。' });
        } finally {
          setSending(false);
        }
      }, [client, topic, type, exerciseCount, values, updateHistory, scan, status.kind]);

      const selectStyle = {
        padding: '4px 6px',
        border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
        borderRadius: '6px',
        background: 'transparent',
        color: 'inherit',
        fontSize: '12px',
      };
      const inputStyle = {
        flex: '1 1 130px',
        minWidth: 0,
        padding: '4px 8px',
        border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
        borderRadius: '6px',
        background: 'transparent',
        color: 'inherit',
        fontSize: '12px',
      };
      const smallButton = {
        padding: '4px 10px',
        border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
        borderRadius: '6px',
        background: 'transparent',
        color: 'inherit',
        fontSize: '12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      };
      const formatText = [withDocx ? 'Word' : '', withPptx ? 'PPT' : '', withHtml ? 'HTML' : ''].filter(Boolean).join('/') || '仅 Markdown';
      const editionText = edition === 'teacher' ? '教师版' : edition === 'student' ? '学生版' : '两套都出';
      const statusColor = status.kind === 'failed' ? '#c2410c' : status.kind === 'completed' ? '#15803d' : '#2e6fb7';
      const statusText = status.text || '待生成';
      const artifacts = status.artifacts || [];
      const teacherArtifacts = artifacts.filter((path) => path.includes('/teacher/') || path.includes('\\teacher\\'));
      const studentArtifacts = artifacts.filter((path) => path.includes('/student/') || path.includes('\\student\\'));
      const canGenerate = !sending && !cooldown;

      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            margin: '6px 0',
            padding: '8px 10px',
            border: '1px solid color-mix(in srgb, currentColor 18%, transparent)',
            borderRadius: '10px',
            fontSize: '12px',
            lineHeight: '18px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          h('span', { style: { opacity: 0.8, whiteSpace: 'nowrap' } }, '一键备课'),
          h('input', {
            value: topic,
            onChange: (event) => setTopic(event.target.value),
            placeholder: '知识点，例如 函数求导',
            'aria-label': '知识点',
            style: inputStyle,
          }),
          h('select', {
            value: duration,
            onChange: (event) => setDuration(event.target.value),
            'aria-label': '课时长度',
            style: selectStyle,
          }, h('option', { value: '45' }, '45 分钟'), h('option', { value: '60' }, '60 分钟'), h('option', { value: '90' }, '90 分钟')),
          h('select', {
            value: edition,
            onChange: (event) => setEdition(event.target.value),
            'aria-label': '版本',
            style: selectStyle,
          }, h('option', { value: 'both' }, '两套都出'), h('option', { value: 'teacher' }, '教师版'), h('option', { value: 'student' }, '学生版')),
          h('button', {
            type: 'button',
            onClick: send,
            disabled: !canGenerate,
            title: '按当前设置自动发送备课指令',
            style: {
              padding: '5px 14px',
              border: 'none',
              borderRadius: '6px',
              background: canGenerate ? '#1f3a5f' : 'color-mix(in srgb, currentColor 18%, transparent)',
              color: canGenerate ? '#fff' : 'inherit',
              fontSize: '12px',
              fontWeight: 700,
              cursor: canGenerate ? 'pointer' : 'wait',
              whiteSpace: 'nowrap',
            },
          }, sending ? '发送中…' : cooldown ? '已发送' : '生成'),
          h('button', {
            type: 'button',
            onClick: () => setAdvanced((value) => !value),
            style: smallButton,
            'aria-expanded': advanced,
          }, advanced ? '收起设置' : '更多设置'),
          h('button', {
            type: 'button',
            onClick: () => { setDetailTab('history'); setDetailsOpen(true); },
            style: smallButton,
          }, '历史'),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', opacity: 0.78 } },
          h('span', null, '当前：' + editionText + ' · ' + teachingMode + ' · ' + courseLevel + ' · ' + exerciseCount + ' 题 · ' + formatText),
          status.kind !== 'idle' || detailsOpen
            ? h('button', {
                type: 'button',
                onClick: () => setDetailsOpen((value) => !value),
                'aria-expanded': detailsOpen,
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: statusColor,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: 0,
                },
              }, h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: statusColor, display: 'inline-block' } }), statusText, h('span', null, detailsOpen ? '▴' : '▾'))
            : null,
        ),
        advanced
          ? h(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '4px' } },
              h('select', {
                value: type,
                onChange: (event) => setType(event.target.value),
                'aria-label': '生成类型',
                style: selectStyle,
              }, h('option', { value: 'kit' }, '课时包'), h('option', { value: 'lesson' }, '三件套')),
              h('select', {
                value: teachingMode,
                onChange: (event) => setTeachingMode(event.target.value),
                'aria-label': '教学模式',
                style: selectStyle,
              }, h('option', { value: '讲授' }, '讲授'), h('option', { value: '研讨' }, '研讨'), h('option', { value: '翻转' }, '翻转')),
              h('select', {
                value: courseLevel,
                onChange: (event) => setCourseLevel(event.target.value),
                'aria-label': '学情层次',
                style: selectStyle,
              }, h('option', { value: '本科基础' }, '本科基础'), h('option', { value: '专业核心' }, '专业核心'), h('option', { value: '研究生' }, '研究生')),
              h('input', {
                type: 'number', min: 1, max: 20, value: exerciseCount,
                onChange: (event) => setExerciseCount(event.target.value),
                'aria-label': '习题数量',
                style: { ...selectStyle, width: '64px' },
              }),
              h('label', { style: { display: 'inline-flex', gap: '3px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: withDocx, onChange: (event) => setWithDocx(event.target.checked) }), 'Word'),
              h('label', { style: { display: 'inline-flex', gap: '3px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: withPptx, onChange: (event) => setWithPptx(event.target.checked) }), 'PPT'),
              h('label', { style: { display: 'inline-flex', gap: '3px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: withHtml, onChange: (event) => setWithHtml(event.target.checked) }), 'HTML'),
              h('button', { type: 'button', onClick: copy, style: smallButton }, copied ? '已复制' : '复制指令'),
            )
          : null,
        detailsOpen
          ? h(
              'div',
              {
                style: {
                  border: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  maxHeight: '320px',
                  overflow: 'auto',
                  background: 'color-mix(in srgb, currentColor 3%, transparent)',
                },
              },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
                h('strong', null, '生成详情'),
                h('button', { type: 'button', onClick: () => setDetailsOpen(false), style: smallButton }, '收起'),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' } },
                ['已发送', '排队', '执行中', '完成'].map((label, index) => {
                  const activeIndex = status.kind === 'completed' ? 3 : status.kind === 'running' ? 2 : status.kind === 'queued' ? 1 : 0;
                  return h('span', { key: label, style: { color: index <= activeIndex ? statusColor : 'inherit', opacity: index <= activeIndex ? 1 : 0.45 } }, (index <= activeIndex ? '● ' : '○ ') + label);
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '8px', marginBottom: '6px' } },
                h('button', { type: 'button', onClick: () => setDetailTab('result'), style: { ...smallButton, background: detailTab === 'result' ? 'color-mix(in srgb, currentColor 10%, transparent)' : 'transparent' } }, '本次结果'),
                h('button', { type: 'button', onClick: () => setDetailTab('history'), style: { ...smallButton, background: detailTab === 'history' ? 'color-mix(in srgb, currentColor 10%, transparent)' : 'transparent' } }, '历史 ' + history.length),
              ),
              detailTab === 'result'
                ? h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                    artifacts.length > 0
                      ? h('div', null,
                          h('div', { style: { fontWeight: 700 } }, status.lessonId || '本次生成'),
                          h('div', { style: { opacity: 0.8, marginBottom: '4px' } }, '共 ' + artifacts.length + ' 件：教师 ' + teacherArtifacts.length + ' / 学生 ' + studentArtifacts.length),
                          h('details', null,
                            h('summary', { style: { cursor: 'pointer' } }, '教师版 ' + teacherArtifacts.length + ' 件'),
                            teacherArtifacts.map((path) => h('div', { key: path, style: { fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', opacity: 0.8 } }, path)),
                          ),
                          h('details', null,
                            h('summary', { style: { cursor: 'pointer' } }, '学生版 ' + studentArtifacts.length + ' 件'),
                            studentArtifacts.map((path) => h('div', { key: path, style: { fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', opacity: 0.8 } }, path)),
                          ),
                          h('button', {
                            type: 'button',
                            style: { ...smallButton, marginTop: '4px' },
                            onClick: async () => {
                              try { await navigator.clipboard.writeText(artifacts.join('\n')); } catch { /* noop */ }
                            },
                          }, '复制全部路径'),
                        )
                      : h('div', { style: { opacity: 0.8 } }, status.kind === 'failed'
                          ? status.text
                          : '已发送，生成结果会出现在对话中；如果这里没有自动识别，请到对话查看路径。'),
                  )
                : h(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                    h(
                      'div',
                      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', opacity: 0.72, marginBottom: '2px' } },
                      h('span', null, '历史仅保存在本浏览器'),
                      h('button', { type: 'button', onClick: clearHistory, disabled: history.length === 0, style: { ...smallButton, opacity: history.length === 0 ? 0.45 : 1 } }, '清空历史'),
                    ),
                    history.length === 0
                      ? h('div', { style: { opacity: 0.7 } }, '还没有历史记录。')
                      : history.map((item) => h('div', { key: item.id, style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid color-mix(in srgb, currentColor 8%, transparent)', padding: '3px 0' } },
                          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.topic + ' · ' + item.duration + ' 分钟 · ' + (item.status === 'completed' ? '已生成' : item.status === 'failed' ? '失败' : '已发送')),
                          h('button', {
                            type: 'button',
                            style: smallButton,
                            onClick: () => {
                              setTopic(item.topic || '函数求导');
                              setDuration(String(item.duration || '60'));
                              setEdition(item.edition || 'both');
                              setExerciseCount(String(item.exerciseCount || 8));
                              setDetailsOpen(false);
                            },
                          }, '回填'),
                        )),
                  ),
            )
          : null,
      );
    }

    return {
      inject: ['slots', 'sessions'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'teacher-lesson-kit', order: 5 },
            () => h(LessonDock, { client: ctx }),
          ),
        );
      },
    };
  },
});
