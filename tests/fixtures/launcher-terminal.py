"""Own a private terminal for the actual launcher. No owner terminal is used."""
import errno
import json
import os
import pty
import select
import signal
import sys
import time


def emit(value):
    print(json.dumps(value), flush=True)


pid, terminal = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], sys.argv[1:])

terminal_open = True
stdin_open = True
terminal_ready = False
pending = b""
ready_deadline = time.monotonic() + 10
while True:
    if not terminal_ready:
        foreground = os.tcgetpgrp(terminal)
        if foreground == pid:
            terminal_ready = True
            emit({"kind": "ready", "pid": pid, "foreground": foreground})
        elif time.monotonic() > ready_deadline:
            os.kill(pid, signal.SIGHUP)
            raise RuntimeError("Owned terminal foreground group did not become ready")
    inputs = ([terminal] if terminal_open else []) + ([0] if stdin_open else [])
    ready, _, _ = select.select(inputs, [], [], 0.05)
    for source in ready:
        if source == terminal:
            try:
                data = os.read(terminal, 4096)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b""
            if data:
                emit({"kind": "output", "text": data.decode("utf-8", errors="replace")})
            else:
                terminal_open = False
        else:
            data = os.read(0, 4096)
            if not data:
                stdin_open = False
                os.kill(pid, signal.SIGHUP)
                continue
            pending += data
            while b"\n" in pending:
                line, pending = pending.split(b"\n", 1)
                command = json.loads(line)
                if command["kind"] == "interrupt":
                    assert os.tcgetpgrp(terminal) == pid
                    # The line discipline sends SIGINT to the actual foreground group.
                    os.write(terminal, b"\x03")
                    emit({"kind": "signal-sent", "signal": "SIGINT"})
                elif command["kind"] == "signal":
                    assert command["signal"] in ("SIGTERM", "SIGHUP")
                    assert os.tcgetpgrp(terminal) == pid
                    os.killpg(pid, getattr(signal, command["signal"]))
                    emit({"kind": "signal-sent", "signal": command["signal"]})
                elif command["kind"] == "quit":
                    # Fixture cleanup addresses only the known launcher, never its group.
                    os.kill(pid, signal.SIGHUP)
    observed, status = os.waitpid(pid, os.WNOHANG)
    if observed:
        emit({"kind": "exit", "code": os.waitstatus_to_exitcode(status)})
        os.close(terminal)
        break
