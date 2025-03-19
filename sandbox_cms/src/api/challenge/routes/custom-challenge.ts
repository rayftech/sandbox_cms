// sandbox_cms/src/api/challenge/routes/custom-challenge.ts
export default {
    routes: [
      {
        method: 'PUT',
        path: '/challenges/:id/sync-from-external',
        handler: 'custom-challenge.syncFromExternal',
        config: {
          policies: [], // Add policies if needed
          middlewares: [], // Add middlewares if needed
        },
      },
      {
        method: 'POST',
        path: '/challenges/validate-user-id',
        handler: 'custom-challenge.validateUserId',
        config: {
          policies: [], // Add policies if needed
          middlewares: [], // Add middlewares if needed
        },
      },
    ],
  };