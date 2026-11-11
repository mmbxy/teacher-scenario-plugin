window.__ModuleLoader__.load({
  id: 'teacher-scenario-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PROMPT = (topic, mode, duration) => {
      if (mode === 'lesson') {
        return '使用 teacher_generate_lesson 生成《' + topic + '》的可交互讲解页、讲义与 6 道基础练习题。';
      }
      return '使用 teacher_generate_lecture_kit 生成《' + topic + '》的 ' + duration + ' 分钟课时包（教案、讲义、练习、板书、互动，并导出 Word 与 PPT）。';
    };

    /**
     * 一键备课入口：装载在 composer 下方的 dock 里。
     *
     * 只做两件事：收集知识点/模式/时长、把标准调用指令复制到剪贴板。
     * 真正的生成仍由 Host 工具完成；这里不依赖额外的 Host 调用 API。
     */
    function LessonDock({ client }) {
      const [topic, setTopic] = React.useState('函数求导');
      const [mode, setMode] = React.useState('kit');
      const [duration, setDuration] = React.useState('60');
      const [copied, setCopied] = React.useState(false);
      const [sending, setSending] = React.useState(false);
      const [sendStatus, setSendStatus] = React.useState('');

      const copy = React.useCallback(async () => {
        const text = PROMPT(topic.trim() || '函数求导', mode, duration);
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
      }, [topic, mode, duration]);

      const send = React.useCallback(async () => {
        setSending(true);
        setSendStatus('');
        try {
          const rows = client && client.sessions
            ? Object.values(client.sessions.list.getSnapshot().byId)
            : [];
          const row = rows.find((item) => (item.retainedBy && item.retainedBy.mainView ? item.retainedBy.mainView : 0) > 0) || rows[0];
          if (!row || !row.id) {
            setSendStatus('未找到当前会话');
            return;
          }
          const text = PROMPT(topic.trim() || '函数求导', mode, duration);
          const result = await client.sessions.using(row.id, { source: 'teacher-spike' }, async (reference) => {
            const binding = await reference.ready;
            return binding.session.prompt([{ type: 'text', text }], 'queue');
          });
          if (result && result.ok) {
            setSendStatus('已发送，等待对话执行');
          } else {
            setSendStatus('发送失败：' + (result && result.error ? result.error.code || result.error.message : '未知错误'));
          }
        } catch (error) {
          setSendStatus('发送异常：' + (error && error.message ? error.message : String(error)));
        } finally {
          setSending(false);
        }
      }, [client, topic, mode, duration]);

      const selectStyle = {
        padding: '4px 6px',
        border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
        borderRadius: '6px',
        background: 'transparent',
        color: 'inherit',
        fontSize: '12px',
      };

      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: '6px 0',
            padding: '8px 10px',
            border: '1px solid color-mix(in srgb, currentColor 18%, transparent)',
            borderRadius: '10px',
            fontSize: '12px',
            lineHeight: '18px',
          },
        },
        h('span', { style: { opacity: 0.8, whiteSpace: 'nowrap' } }, '一键备课'),
        h('input', {
          value: topic,
          onChange: (event) => setTopic(event.target.value),
          placeholder: '知识点，例如 函数求导',
          'aria-label': '知识点',
          style: {
            flex: '1 1 120px',
            minWidth: 0,
            padding: '4px 8px',
            border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
            borderRadius: '6px',
            background: 'transparent',
            color: 'inherit',
            fontSize: '12px',
          },
        }),
        h(
          'select',
          {
            value: mode,
            onChange: (event) => setMode(event.target.value),
            'aria-label': '生成模式',
            style: selectStyle,
          },
          h('option', { value: 'kit' }, '课时包'),
          h('option', { value: 'lesson' }, '三件套'),
        ),
        mode === 'kit'
          ? h(
              'select',
              {
                value: duration,
                onChange: (event) => setDuration(event.target.value),
                'aria-label': '课时长度',
                style: selectStyle,
              },
              h('option', { value: '45' }, '45 分钟'),
              h('option', { value: '60' }, '60 分钟'),
              h('option', { value: '90' }, '90 分钟'),
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            onClick: copy,
            title: '复制调用指令，粘贴到输入框发送即可生成',
            style: {
              padding: '4px 10px',
              border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
              borderRadius: '6px',
              background: 'transparent',
              color: 'inherit',
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            },
          },
          copied ? '已复制' : '复制指令',
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: send,
            disabled: sending,
            title: 'B 方案 spike：自动发送标准指令到当前会话',
            style: {
              padding: '4px 10px',
              border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
              borderRadius: '6px',
              background: 'transparent',
              color: 'inherit',
              fontSize: '12px',
              cursor: sending ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: sending ? 0.6 : 1,
            },
          },
          sending ? '发送中' : '发送测试',
        ),
        sendStatus
          ? h('span', { role: 'status', style: { opacity: 0.8, whiteSpace: 'nowrap' } }, sendStatus)
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
