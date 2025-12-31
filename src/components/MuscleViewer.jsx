import { useState } from 'react'
import './MuscleViewer.css'

const MuscleViewer = () => {
  const [muscleColors, setMuscleColors] = useState({})
  const [selectedColor, setSelectedColor] = useState('#ff6b6b')
  const [hoveredMuscle, setHoveredMuscle] = useState(null)

  const predefinedColors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b',
    '#eb4d4b', '#6c5ce7', '#a29bfe', '#00b894', '#00cec9',
    '#fd79a8', '#fdcb6e', '#e17055', '#74b9ff', '#0984e3'
  ]

  const handleMuscleClick = (muscleId) => {
    setMuscleColors(prev => ({
      ...prev,
      [muscleId]: prev[muscleId] === selectedColor ? 'transparent' : selectedColor
    }))
  }

  const handleColorSelect = (color) => {
    setSelectedColor(color)
  }

  const handleColorInput = (e) => {
    setSelectedColor(e.target.value)
  }

  const resetColors = () => {
    setMuscleColors({})
  }

  const muscles = [
    { 
      id: 'pectorales', 
      name: 'Pectorales', 
      path: 'M 145 85 Q 135 105 130 125 Q 125 145 130 165 Q 135 185 145 200 L 160 200 Q 170 185 175 165 Q 180 145 175 125 Q 170 105 160 85 Z' 
    },
    { 
      id: 'deltoides', 
      name: 'Deltoides', 
      path: 'M 125 65 L 115 85 L 125 105 L 145 105 L 155 85 L 145 65 Z M 195 65 L 205 85 L 195 105 L 175 105 L 165 85 L 175 65 Z' 
    },
    { 
      id: 'biceps', 
      name: 'Bíceps', 
      path: 'M 135 125 L 125 145 L 135 185 L 145 185 L 155 145 L 145 125 Z M 205 125 L 215 145 L 205 185 L 195 185 L 185 145 L 195 125 Z' 
    },
    { 
      id: 'triceps', 
      name: 'Tríceps', 
      path: 'M 115 125 L 105 145 L 115 185 L 125 185 L 135 145 L 125 125 Z M 225 125 L 235 145 L 225 185 L 215 185 L 205 145 L 215 125 Z' 
    },
    { 
      id: 'abdominales', 
      name: 'Abdominales', 
      path: 'M 145 205 L 155 205 L 155 245 L 150 255 L 145 245 Z' 
    },
    { 
      id: 'oblicuos', 
      name: 'Oblicuos', 
      path: 'M 135 205 L 145 205 L 145 245 L 135 255 L 125 245 Z M 195 205 L 205 205 L 205 245 L 195 255 L 185 245 Z' 
    },
    { 
      id: 'cuadriceps', 
      name: 'Cuádriceps', 
      path: 'M 145 285 L 155 285 L 160 355 L 155 365 L 145 355 Z M 195 285 L 205 285 L 205 355 L 195 365 L 185 355 Z' 
    },
    { 
      id: 'gemelos', 
      name: 'Gemelos', 
      path: 'M 145 365 L 155 365 L 157 405 L 155 415 L 143 405 Z M 195 365 L 205 365 L 205 405 L 195 415 L 185 405 Z' 
    },
    { 
      id: 'gluteos', 
      name: 'Glúteos', 
      path: 'M 135 265 L 150 265 L 155 285 L 150 295 L 140 285 Z M 190 265 L 205 265 L 205 285 L 195 295 L 190 285 Z' 
    },
    { 
      id: 'dorsales', 
      name: 'Dorsales', 
      path: 'M 120 105 L 110 125 L 120 185 L 130 185 L 140 125 L 130 105 Z M 220 105 L 230 125 L 220 185 L 210 185 L 200 125 L 210 105 Z' 
    },
    { 
      id: 'trapecio', 
      name: 'Trapecio', 
      path: 'M 130 45 L 120 65 L 130 85 L 150 85 L 160 65 L 150 45 Z M 190 45 L 200 65 L 190 85 L 170 85 L 160 65 L 170 45 Z' 
    },
  ]

  return (
    <div className="muscle-viewer">
      <div className="controls-panel">
        <div className="color-selector">
          <h3>Selector de Color</h3>
          <div className="color-palette">
            {predefinedColors.map((color, index) => (
              <button
                key={index}
                className={`color-button ${selectedColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => handleColorSelect(color)}
                title={color}
              />
            ))}
          </div>
          <div className="custom-color">
            <label htmlFor="custom-color">Color personalizado:</label>
            <input
              id="custom-color"
              type="color"
              value={selectedColor}
              onChange={handleColorInput}
            />
            <span className="color-value">{selectedColor}</span>
          </div>
        </div>
        
        <div className="muscle-list">
          <h3>Músculos</h3>
          <div className="muscle-items">
            {muscles.map(muscle => (
              <div
                key={muscle.id}
                className={`muscle-item ${hoveredMuscle === muscle.id ? 'hovered' : ''}`}
                style={{
                  borderLeftColor: muscleColors[muscle.id] || 'transparent'
                }}
                onMouseEnter={() => setHoveredMuscle(muscle.id)}
                onMouseLeave={() => setHoveredMuscle(null)}
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
        <svg
          viewBox="0 0 340 420"
          className="body-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Cabeza */}
          <ellipse cx="170" cy="30" rx="25" ry="30" fill="#f4d3a1" stroke="#333" strokeWidth="2" />
          
          {/* Cuello */}
          <rect x="160" y="60" width="20" height="20" rx="3" fill="#f4d3a1" stroke="#333" strokeWidth="2" />
          
          {/* Torso - Vista frontal */}
          <path
            d="M 145 80 Q 135 100 125 140 Q 115 180 125 220 Q 135 260 150 280 L 190 280 Q 205 260 215 220 Q 225 180 215 140 Q 205 100 195 80 Z"
            fill="#f4d3a1"
            stroke="#333"
            strokeWidth="2"
          />
          
          {/* Brazo izquierdo */}
          <ellipse cx="100" cy="155" rx="18" ry="75" fill="#f4d3a1" stroke="#333" strokeWidth="2" />
          
          {/* Brazo derecho */}
          <ellipse cx="240" cy="155" rx="18" ry="75" fill="#f4d3a1" stroke="#333" strokeWidth="2" />
          
          {/* Pierna izquierda */}
          <ellipse cx="150" cy="325" rx="22" ry="95" fill="#f4d3a1" stroke="#333" strokeWidth="2" />
          
          {/* Pierna derecha */}
          <ellipse cx="190" cy="325" rx="22" ry="95" fill="#f4d3a1" stroke="#333" strokeWidth="2" />
          
          {/* Músculos */}
          {muscles.map(muscle => (
            <path
              key={muscle.id}
              id={muscle.id}
              d={muscle.path}
              fill={muscleColors[muscle.id] || 'transparent'}
              stroke={muscleColors[muscle.id] ? '#333' : 'transparent'}
              strokeWidth="2"
              opacity={muscleColors[muscle.id] ? '0.7' : '0'}
              className="muscle-path"
              onClick={() => handleMuscleClick(muscle.id)}
              onMouseEnter={() => setHoveredMuscle(muscle.id)}
              onMouseLeave={() => setHoveredMuscle(null)}
              style={{
                cursor: 'pointer',
                opacity: hoveredMuscle === muscle.id ? '0.5' : (muscleColors[muscle.id] ? '0.7' : '0'),
                fill: hoveredMuscle === muscle.id && !muscleColors[muscle.id] 
                  ? selectedColor 
                  : (muscleColors[muscle.id] || 'transparent')
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

export default MuscleViewer

