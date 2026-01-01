import { useState } from 'react'
import BodySVG, { muscles } from './BodySVG'
import './MuscleViewer.css'

const MuscleViewer = () => {
  const [muscleColors, setMuscleColors] = useState({})
  const [selectedColor, setSelectedColor] = useState('#eb4d4b')
  const [hoveredMuscle, setHoveredMuscle] = useState(null)
  const [view, setView] = useState('front') // 'front' or 'back'

  const handleMuscleClick = (muscleId) => {
    setMuscleColors(prev => ({
      ...prev,
      [muscleId]: prev[muscleId] === selectedColor ? 'transparent' : selectedColor
    }))
  }

  const handleColorSelect = (color) => {
    setSelectedColor(color)
  }

  const resetColors = () => {
    setMuscleColors({})
  }

  return (
    <div className="muscle-viewer">
      <div className="controls-panel">
        <div className="view-selector">
          <h3>Vista</h3>
          <div className="view-buttons">
            <button 
              className={`view-button ${view === 'front' ? 'active' : ''}`}
              onClick={() => setView('front')}
            >
              Frontal
            </button>
            <button 
              className={`view-button ${view === 'back' ? 'active' : ''}`}
              onClick={() => setView('back')}
            >
              Posterior
            </button>
          </div>
        </div>

        <div className="muscle-list">
          <h3>Músculos ({view === 'front' ? 'Frontal' : 'Posterior'})</h3>
          <div className="muscle-items">
            {muscles[view].map(muscle => (
              <div
                key={muscle.id}
                className={`muscle-item ${hoveredMuscle === muscle.id ? 'hovered' : ''}`}
                style={{
                  borderLeftColor: muscleColors[muscle.id] || 'transparent'
                }}
                onMouseEnter={() => setHoveredMuscle(muscle.id)}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => handleMuscleClick(muscle.id)}
              >
                <span>{muscle.name}</span>
                {muscleColors[muscle.id] && (
                  <span className="color-indicator" style={{ backgroundColor: muscleColors[muscle.id] }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <button className="reset-button" onClick={resetColors}>
          Limpiar Colores
        </button>
      </div>

      <div className="svg-container">
        <div className="body-container">
          <BodySVG
            view={view}
            muscleColors={muscleColors}
            hoveredMuscle={hoveredMuscle}
            onMuscleClick={handleMuscleClick}
            onMuscleHover={setHoveredMuscle}
          />
          <div className="view-label">{view === 'front' ? 'Vista Frontal' : 'Vista Posterior'}</div>
        </div>
      </div>
    </div>
  )
}

export default MuscleViewer

