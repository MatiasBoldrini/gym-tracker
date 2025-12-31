import { useState } from 'react'
import MuscleViewer from './components/MuscleViewer'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>Visualizador de Músculos</h1>
        <p>Haz clic en un músculo para colorearlo</p>
      </header>
      <main className="main-content">
        <MuscleViewer />
      </main>
    </div>
  )
}

export default App

