window.__ModuleLoader__.load({
  id: 'teacher-scenario-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PROMPT = (topic) =>
      '使用 teacher_generate_lesson 生成《' + topic + '》的可交互讲解页、讲义与 6 道基础练习题。';

    /**
     * 一键备课入口：装载在 composer 下方的 dock 里。
     *
     * 只做两件事：收集知识点、把标准调用指令复制到剪贴板。
     * 真正的生成仍由 Host 工具 teacher_generate_lesson 完成，
     * 因此这里不依赖额外的 Host 调用 API。
     */
    function LessonDock() {
      const [topic, setTopic] = React.useState('函数求导');
      const [copied, setCopied] = React.useState(false);

      const copy = React.useCallback(async () => {
        const text = PROMPT(topic.trim() || '函数求导');
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
      }, [topic]);

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
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'teacher-lesson-kit', order: 5 },
            LessonDock,
          ),
        );
      },
    };
  },
});
