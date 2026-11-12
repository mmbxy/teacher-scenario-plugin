window.__ModuleLoader__.load({
  id: 'teacher-scenario-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

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
      const [status, setStatus] = React.useState('');

      const values = {
        topic, type, duration, edition, teachingMode, courseLevel,
        exerciseCount: Number(exerciseCount), withDocx, withPptx, withHtml
      };

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

      const send = React.useCallback(async () => {
        const cleanTopic = topic.trim();
        if (!cleanTopic) {
          setStatus('请先填写知识点。');
          return;
        }
        if (type === 'kit') {
          const count = Number(exerciseCount);
          if (!Number.isInteger(count) || count < 1 || count > 20) {
            setStatus('题量需要填写 1–20 的整数。');
            return;
          }
        }
        if (!client || !client.sessions) {
          setStatus('当前页面没有会话服务，请刷新后重试。');
          return;
        }

        setSending(true);
        setStatus('正在发送…');
        try {
          const rows = Object.values(client.sessions.list.getSnapshot().byId);
          const row = rows.find((item) => (item.retainedBy && item.retainedBy.mainView ? item.retainedBy.mainView : 0) > 0) || rows[0];
          if (!row || !row.id) {
            setStatus('未找到当前会话，请刷新页面后重试。');
            return;
          }
          const text = promptFor(values);
          const result = await client.sessions.using(row.id, { source: 'teacher-kit-panel' }, async (reference) => {
            const binding = await reference.ready;
            return binding.session.prompt([{ type: 'text', text }], 'queue');
          });
          if (result && result.ok) {
            setStatus('已发送。生成结果会出现在对话中；完成前请勿重复点击。');
            setCooldown(true);
            window.setTimeout(() => setCooldown(false), 20000);
          } else {
            setStatus('发送失败：' + (result && result.error ? result.error.code || result.error.message : '未知错误') + '。可以重试。');
          }
        } catch (error) {
          setStatus('发送失败：' + (error && error.message ? error.message : String(error)) + '。可以重试。');
        } finally {
          setSending(false);
        }
      }, [client, topic, type, exerciseCount, values]);

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
          h(
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
          ),
          h(
            'select',
            {
              value: edition,
              onChange: (event) => setEdition(event.target.value),
              'aria-label': '版本',
              style: selectStyle,
            },
            h('option', { value: 'both' }, '两套都出'),
            h('option', { value: 'teacher' }, '教师版'),
            h('option', { value: 'student' }, '学生版'),
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: send,
              disabled: sending || cooldown,
              title: '按当前设置自动发送备课指令',
              style: {
                padding: '5px 14px',
                border: 'none',
                borderRadius: '6px',
                background: sending || cooldown ? 'color-mix(in srgb, currentColor 18%, transparent)' : '#1f3a5f',
                color: sending || cooldown ? 'inherit' : '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: sending || cooldown ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              },
            },
            sending ? '发送中…' : cooldown ? '已发送' : '生成',
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => setAdvanced((value) => !value),
              style: smallButton,
              'aria-expanded': advanced,
            },
            advanced ? '收起设置' : '更多设置',
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', opacity: 0.75 } },
          h('span', null, '当前：' + editionText + ' · ' + teachingMode + ' · ' + courseLevel + ' · ' + exerciseCount + ' 题 · ' + formatText),
          h('span', null, '支持 45 / 60 / 90 分钟；当前知识点仅「函数求导」。'),
        ),
        advanced
          ? h(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '4px' } },
              h(
                'select',
                {
                  value: type,
                  onChange: (event) => setType(event.target.value),
                  'aria-label': '生成类型',
                  style: selectStyle,
                },
                h('option', { value: 'kit' }, '课时包'),
                h('option', { value: 'lesson' }, '三件套'),
              ),
              h(
                'select',
                {
                  value: teachingMode,
                  onChange: (event) => setTeachingMode(event.target.value),
                  'aria-label': '教学模式',
                  style: selectStyle,
                },
                h('option', { value: '讲授' }, '讲授'),
                h('option', { value: '研讨' }, '研讨'),
                h('option', { value: '翻转' }, '翻转'),
              ),
              h(
                'select',
                {
                  value: courseLevel,
                  onChange: (event) => setCourseLevel(event.target.value),
                  'aria-label': '学情层次',
                  style: selectStyle,
                },
                h('option', { value: '本科基础' }, '本科基础'),
                h('option', { value: '专业核心' }, '专业核心'),
                h('option', { value: '研究生' }, '研究生'),
              ),
              h('input', {
                type: 'number',
                min: 1,
                max: 20,
                value: exerciseCount,
                onChange: (event) => setExerciseCount(event.target.value),
                'aria-label': '习题数量',
                style: { ...selectStyle, width: '64px' },
              }),
              h('label', { style: { display: 'inline-flex', gap: '3px', alignItems: 'center' } },
                h('input', { type: 'checkbox', checked: withDocx, onChange: (event) => setWithDocx(event.target.checked) }), 'Word'),
              h('label', { style: { display: 'inline-flex', gap: '3px', alignItems: 'center' } },
                h('input', { type: 'checkbox', checked: withPptx, onChange: (event) => setWithPptx(event.target.checked) }), 'PPT'),
              h('label', { style: { display: 'inline-flex', gap: '3px', alignItems: 'center' } },
                h('input', { type: 'checkbox', checked: withHtml, onChange: (event) => setWithHtml(event.target.checked) }), 'HTML'),
              h('button', { type: 'button', onClick: copy, style: smallButton }, copied ? '已复制' : '复制指令'),
            )
          : null,
        status
          ? h('div', { role: 'status', style: { opacity: 0.85 } }, status)
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
