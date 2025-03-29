// sandbox_cms/src/api/challenge/routes/challenge-list.ts
export default {
    routes: [
      {
        method: 'GET',
        path: '/api/challenges/status/:status?',
        handler: 'challenge-list.listByStatus',
        config: {
          policies: [],
          middlewares: [],
          auth: false, 
          description: 'Get challenges grouped by status',
          tag: {
            plugin: 'challenge',
            name: 'Challenges',
            actionType: 'find',
          },
        },
      },
    ],
  };