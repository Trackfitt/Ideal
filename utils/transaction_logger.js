module.exports = {
    logTransaction: (session, action) => {
      console.log(`[TX ${session.id}] ${action} at ${new Date().toISOString()}`);
    }
  };