import {
  callRemote,
  listenRemote,
  getTerminalIns,
  getNoticeMessage,
  intl,
  notify,
  runTask,
  cancelTask,
} from '../util';

export const namespace = 'org.umi.taskManager';
import { TaskType, TaskState } from '../../server/core/enums';

let init = false;

export default {
  namespace,
  state: {
    currentProject: {},
    tasks: {}, // [cwd]: { dev: DevTask, build: BuildTask, ... }
  },
  effects: {
    // 初始化 taskManager
    *init({ payload, callback }, { call, put }) {
      const { currentProject } = payload;
      const { states: taskStates } = yield callRemote({
        type: 'plugin/init',
      });
      yield put({
        type: 'initCurrentProjectState',
        payload: {
          currentProject,
          taskStates,
        },
      });
    },
    // 执行任务
    *exec({ payload }, { call }) {
      const { taskType, env } = payload;
      yield call(runTask, taskType, env);
    },
    // 取消任务
    *cancel({ payload }, { call }) {
      const { taskType } = payload;
      yield call(cancelTask, taskType);
    },
  },
  reducers: {
    initCurrentProjectState(state, { payload }) {
      const { currentProject, taskStates } = payload;
      return {
        ...state,
        currentProject,
        tasks: {
          ...state.tasks,
          [currentProject.path]: taskStates,
        },
      };
    },
    updateTaskDetail(state, { payload }) {
      const { taskType, detail, cwd } = payload;
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [cwd]: {
            ...state.tasks[cwd],
            [taskType]: detail,
          },
        },
      };
    },
  },
  subscriptions: {
    setup({ history, dispatch }) {
      history.listen(({ pathname }) => {
        if (init) {
          return;
        }
        if (pathname === '/tasks') {
          init = true;
          // 接收状态通知
          listenRemote({
            type: 'org.umi.task.state',
            onMessage: ({ detail, taskType, cwd }) => {
              // 更新 state 数据
              dispatch({
                type: 'updateTaskDetail',
                payload: {
                  detail,
                  taskType,
                  cwd,
                },
              });

              // 成功或者失败的时候做通知
              if ([TaskState.INIT, TaskState.ING].indexOf(detail.state) > -1) {
                return;
              }
              const { title, message, ...rest } = getNoticeMessage(taskType, detail.state);
              // TODO: 这儿应该加上项目的名称
              notify({
                title: intl({ id: title }),
                message: intl({ id: message }),
                ...rest,
              });
            },
          });
          // 日志更新
          listenRemote({
            type: 'org.umi.task.log',
            onMessage: ({ log = '', taskType }: { log: string; taskType: TaskType }) => {
              if (!log) {
                return;
              }
              // TODO: 多项目之间的 terminalIns 是否已经是混用的了？
              getTerminalIns(taskType).write(log.replace(/\n/g, '\r\n'));
            },
          });
        }
      });
    },
  },
};
