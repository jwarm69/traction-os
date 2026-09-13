export class JsonRpcStdio {
  constructor(
    child,
    {
      onRequest = async () => ({ decision: 'decline' }),
      onNotification = () => {},
      onClose = () => {},
      timeoutMs = 20_000,
    } = {},
  ) {
    Object.assign(this, {
      child,
      onRequest,
      onNotification,
      onClose,
      timeoutMs,
    });
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.closed = false;
    child.stdout.setEncoding?.('utf8');
    child.stdout.on('data', (data) => this.read(data));
    child.stderr?.resume?.();
    child.on('error', (error) => this.close(error));
    child.on('exit', (code, signal) =>
      this.close(new Error(`Codex exited (${code ?? signal}).`)),
    );
    child.stdin.on?.('error', (error) => this.close(error));
  }
  close(error = new Error('Codex connection closed.')) {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
    this.onClose(error);
  }
  write(message) {
    if (this.closed) throw new Error('Codex connection closed.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  read(data) {
    if (this.closed) return;
    this.buffer += data;
    if (Buffer.byteLength(this.buffer) > 2_000_000) {
      this.close(new Error('Codex message exceeded the size limit.'));
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.close(new Error('Invalid Codex protocol message.'));
        return;
      }
      if (
        message.id !== undefined &&
        ('result' in message || 'error' in message)
      ) {
        const item = this.pending.get(String(message.id));
        if (!item) continue;
        this.pending.delete(String(message.id));
        clearTimeout(item.timer);
        message.error
          ? item.reject(
              new Error(message.error.message || 'Codex request failed.'),
            )
          : item.resolve(message.result);
      } else if (message.id !== undefined && message.method) {
        Promise.resolve()
          .then(() => this.onRequest(message))
          .then(
            (result) => {
              if (!this.closed) this.write({ id: message.id, result });
            },
            (error) => {
              if (!this.closed)
                this.write({
                  id: message.id,
                  error: {
                    code: -32000,
                    message: 'Request could not be authorized.',
                  },
                });
              this.close(error);
            },
          )
          .catch((error) => this.close(error));
      } else if (message.method) {
        try {
          this.onNotification(message);
        } catch (error) {
          this.close(error);
        }
      }
    }
  }
  request(method, params = {}) {
    if (this.closed)
      return Promise.reject(new Error('Codex connection closed.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.close(new Error(`Codex ${method} timed out.`)),
        this.timeoutMs,
      );
      this.pending.set(String(id), { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.close(error);
      }
    });
  }
  notify(method, params = {}) {
    this.write({ method, params });
  }
}
