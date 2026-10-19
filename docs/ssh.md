# SSH from the Mac to the desktop

How to reach the training desktop (Windows 11 + WSL2 Ubuntu 24.04) from the Mac over Tailscale, from anywhere. This is the remote-access part of phase 1 (#1, [`PLAN.md` · Vaihe 1](PLAN.md#vaihe-1-pöytäkoneen-valmistelu)).

The idea: Tailscale runs on Windows and on the Mac. With WSL in mirrored networking mode, Ubuntu shares the Windows network, so Ubuntu's sshd is reachable at the Windows machine's Tailscale address. No Tailscale is installed inside WSL.

| | Value |
| --- | --- |
| Windows machine's Tailscale name | `<tailscale-name>` |
| WSL user | `<wsl-user>` |
| SSH port | `2222`, key-only login |
| SSH alias on the Mac | `seeni-pc` |

Placeholders in angle brackets are yours to fill in. This repo is public, so keep real host names, user names, addresses and keys out of it.

## 1. Tailscale

Install Tailscale on Windows and on the Mac and sign in to the same tailnet on both. Note the Windows machine's Tailscale name (`<tailscale-name>`, shown in the Tailscale admin console or by `tailscale status`) and its address (`100.x.y.z`).

## 2. WSL in mirrored mode

**On Windows**, create `%UserProfile%\.wslconfig`. Open it with `notepad "$env:USERPROFILE\.wslconfig"` from PowerShell, so the file does not get a `.txt` extension:

```ini
[wsl2]
memory=24GB
networkingMode=mirrored
```

**In Ubuntu**, `/etc/wsl.conf` must contain the following, so sshd can run as a systemd service. Ubuntu 24.04 usually has it already.

```ini
[boot]
systemd=true
```

Restart WSL from PowerShell with `wsl --shutdown`, then open Ubuntu again and check:

- `free -h` shows about 24 GB.
- `ip -4 addr` shows the Windows Tailscale address (`100.x.y.z`). If it does not, mirrored mode is not on.

## 3. sshd in Ubuntu

Ubuntu 24.04 starts sshd through `ssh.socket`, which can ignore the `Port` setting. Switch to the plain service:

```bash
sudo apt install -y openssh-server
printf 'Port 2222\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/10-seeni.conf
sudo systemctl disable --now ssh.socket
sudo systemctl enable --now ssh.service
sudo systemctl restart ssh.service
ss -tln | grep 2222
```

The last command should show sshd listening on port 2222.

## 4. The Mac's key

On the Mac, create a key if you do not have one:

```bash
ssh-keygen -t ed25519
```

Add the contents of the Mac's `~/.ssh/id_ed25519.pub` to `~/.ssh/authorized_keys` in WSL, and fix the permissions there:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Password login is off, so `ssh-copy-id` does not work. Copy the public key over by other means, for example by pasting it in an Ubuntu terminal on the desktop.

## 5. Windows firewall

In mirrored mode, inbound traffic to WSL goes through the Hyper-V firewall, not the normal Windows Firewall rules. Allow port 2222 in an admin PowerShell:

```powershell
New-NetFirewallHyperVRule -Name WSL-SSH -DisplayName "WSL SSH 2222" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 2222
```

## 6. SSH config on the Mac

Add to the Mac's `~/.ssh/config`:

```
Host seeni-pc
  HostName <tailscale-name>
  User <wsl-user>
  Port 2222
```

`HostName` is the Windows machine's Tailscale name. Zed Remote Development works directly against this host.

## 7. Long runs

- Turn off Windows sleep on AC power.
- Run training in `tmux`, so it keeps going when the SSH connection drops.
- WSL must keep running when no Ubuntu window is open, otherwise SSH has nothing to connect to.
- Install Claude Code inside WSL, so agents run commands in the same environment.

## Check

From the Mac:

```bash
ssh seeni-pc                                   # logs in with the key
ssh -o PubkeyAuthentication=no seeni-pc        # must be refused
```

Then close every Ubuntu window on the desktop and run `ssh seeni-pc` again. It should still connect.

## Troubleshooting

- **Connection times out:** check that Tailscale is up on both machines (`tailscale status`), that `ip -4 addr` in WSL shows the `100.x.y.z` address, and that the Hyper-V firewall rule exists (`Get-NetFirewallHyperVRule -Name WSL-SSH`).
- **Connection refused:** sshd is not listening on 2222. Check `ss -tln | grep 2222` and `systemctl status ssh.service`, and that `ssh.socket` is disabled.
- **Permission denied (publickey):** check the key in `~/.ssh/authorized_keys` and the `700`/`600` permissions in WSL.
- **Works only while an Ubuntu window is open:** WSL is shutting down when idle. See [Long runs](#7-long-runs).
