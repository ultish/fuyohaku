import { defineConfig } from 'shaders/config'

export default defineConfig({
  // Components are imported from 'shaders/react'
  framework: 'react',
  // Shaders project this codebase is connected to
  project: 'ad01649e-df3d-4ad6-8ae9-5025e9c50f9b',
  // Where `npx shaders install` writes component files
  outDir: 'src/components/shaders',
})
