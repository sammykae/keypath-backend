import { exec } from 'child_process'
import fse from 'fs-extra'
import fs from 'fs'

async function execCmd(cmd: string) {
  return new Promise<void>((resolve, reject) => {
    console.log(`Running: ${cmd}`)
    const child = exec(cmd)

    if (child.stdout) {
      child.stdout.pipe(process.stdout)
    }

    if (child.stderr) {
      child.stderr.pipe(process.stderr)
    }

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}`))
        return
      }

      resolve()
    })
  })
}

async function main(buildArgs?: string) {
  if (fs.existsSync('./dist')) {
    fse.emptyDirSync('./dist')
  }

  await execCmd(
    'npx tsup ./src/index.ts --format cjs --platform node --target node18 --minify --sourcemap --no-splitting --treeshake'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

