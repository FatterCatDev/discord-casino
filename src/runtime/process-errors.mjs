export function registerProcessErrors() {
  function onRejection(reason) {
    if (reason && typeof reason === 'object' && 'code' in reason && Number(reason.code) === 10062) {
      console.warn('Ignored expired interaction (code 10062)');
      return;
    }
    console.error('Unhandled promise rejection:', reason);
  }

  function onException(err) {
    if (err && typeof err === 'object' && 'code' in err && Number(err.code) === 10062) {
      console.warn('Ignored expired interaction (code 10062)');
      return;
    }
    console.error('Uncaught exception:', err);
  }
  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);
  return () => {
    process.off('unhandledRejection', onRejection);
    process.off('uncaughtException', onException);
  };
}
