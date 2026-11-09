import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';

import generateModule from './src/generate.js';

const { generateLesson } = generateModule;

/** Stable Loader identity. */
export const name = 'teacher-scenario-plugin';

/** Services this plugin registers against. */
export const inject = ['tools', 'workingDirectory'];

const DIFFICULTIES = ['基础', '进阶', '挑战'];

/**
 * Host half of the teacher-scenario bundle.
 *
 * Registers `teacher.generate_lesson`: it runs the pure `src/generate.js`
 * pipeline with real filesystem deps and returns the LessonResult contract.
 *
 * @param ctx - agent-scoped Cordis context.
 * @param config - row config from `cordis.patch.yml` (`timeoutMs`).
 */
export function apply(ctx, config = {}) {
  const timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 120000;

  ctx.tools.register(defineTool({
    name: 'teacher_generate_lesson',
    description:
      '输入知识点，生成可交互讲解页（单文件 HTML）、讲义（Markdown）与基础练习题（Markdown）三份产物，并为每份返回绝对路径。默认知识点为「函数求导」。',
    parameters: {
      topic: {
        type: 'string',
        required: true,
        description: '知识点或章节文本，1–2000 字；纯空白视为无效。'
      },
      audience: {
        type: 'string',
        description: '教学对象，例如「本科一年级」「高中」「研究生」；默认「本科一年级」。'
      },
      difficulty: {
        type: 'string',
        enum: DIFFICULTIES,
        description: '难度：基础 / 进阶 / 挑战；P0 只保证「基础」的产出质量，默认「基础」。'
      },
      exerciseCount: {
        type: 'integer',
        default: 6,
        description: '练习题数量，1–20 的整数，默认 6。'
      },
      withInteractive: {
        type: 'boolean',
        default: true,
        description: '是否生成可交互讲解页，默认 true。'
      },
      withHandout: {
        type: 'boolean',
        default: true,
        description: '是否生成讲义，默认 true。'
      },
      withExercises: {
        type: 'boolean',
        default: true,
        description: '是否生成练习题，默认 true。'
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          lessonId: { type: 'string', required: true },
          topic: { type: 'string', required: true },
          artifacts: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: { type: 'string', required: true },
                format: { type: 'string', required: true },
                path: { type: 'string', required: true },
                questionCount: { type: 'integer' }
              }
            }
          },
          meta: {
            type: 'object',
            additionalProperties: false,
            properties: {
              audience: { type: 'string', required: true },
              difficulty: { type: 'string', required: true },
              generatedAt: { type: 'string', required: true }
            }
          },
          warnings: {
            type: 'array',
            required: true,
            items: { type: 'string' }
          }
        }
      },
      render: (_args, value) => {
        const lines = [
          `已生成 ${value.artifacts.length} 个产物（${value.lessonId}）：`,
          ...value.artifacts.map((artifact) => `- ${artifact.type}（${artifact.format}）：${artifact.path}`),
          ...(value.warnings.length > 0 ? ['', '提示：', ...value.warnings.map((warning) => `- ${warning}`)] : [])
        ];
        return [{ type: 'text', text: lines.join('\n') }];
      }
    },
    async execute(args, exec) {
      if (exec.agent === undefined) {
        throw new Error('teacher.generate_lesson 需要一个 Agent 会话，无法确定产物目录。');
      }

      const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
      const outputDir = config.outputDir && String(config.outputDir).trim().length > 0
        ? String(config.outputDir)
        : path.join(cwd, 'teacher-artifacts');

      const result = await generateLesson(args, {
        now: () => Date.now(),
        outputDir,
        timeoutMs,
        async writeFile(target, content) {
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, content, 'utf8');
        }
      });

      if (!result.ok) {
        const error = new Error(`${result.message}（${result.code}${result.detail ? `：${result.detail}` : ''}）`);
        error.code = result.code;
        error.retryable = result.retryable === true;
        throw error;
      }
      return result;
    }
  }));
}
