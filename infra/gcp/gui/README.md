# CDM Google Cloud Setup Window

This is the GCP-only graphical Windows setup wrapper. It launches the existing deployment engine as a hidden child process and displays its prompts, secret fields, progress, Terraform output, and exact project-specific APPLY confirmation in the app window.

Build on Windows with Node.js 22:

```powershell
npm ci
Copy-Item ..\gcp-assets.js .\gcp-assets.js
cd ..
npx pkg --target node22-win-x64 --output gui/gcp-cli.exe --public-packages '*' gcp-cli.js
cd gui
npm run dist:win
```

The release workflow performs this packaging in CI. Local `node_modules`, generated executables, and `dist` are excluded from version control. This is separate from the generic desktop installer.
