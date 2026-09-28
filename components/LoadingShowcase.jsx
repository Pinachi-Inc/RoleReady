import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';

const LoadingShowcase = () => {
  const [currentLoader, setCurrentLoader] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  const loaders = [
    // Original 8
    {
      name: "CV Paper Plane",
      component: <PaperPlaneLoader />
    },
    {
      name: "Typewriter Resume",
      component: <TypewriterLoader />
    },
    {
      name: "Skills Tetris",
      component: <TetrisLoader />
    },
    {
      name: "Assembly Robot",
      component: <RobotLoader />
    },
    {
      name: "Matrix CV Rain",
      component: <MatrixLoader />
    },
    {
      name: "CV Origami",
      component: <OrigamiLoader />
    },
    {
      name: "Pixel Art Character",
      component: <PixelLoader />
    },
    {
      name: "CV Slot Machine",
      component: <SlotMachineLoader />
    },
    // New 20 loaders
    {
      name: "Document Assembly Line",
      component: <AssemblyLineLoader />
    },
    {
      name: "Code Editor Typing",
      component: <CodeEditorLoader />
    },
    {
      name: "Neural Network",
      component: <NeuralNetworkLoader />
    },
    {
      name: "Progress Bars Race",
      component: <ProgressRaceLoader />
    },
    {
      name: "DNA Helix of Skills",
      component: <DNAHelixLoader />
    },
    {
      name: "Circuit Board Paths",
      component: <CircuitBoardLoader />
    },
    {
      name: "Puzzle Assembly",
      component: <PuzzleLoader />
    },
    {
      name: "Radar Scanning",
      component: <RadarLoader />
    },
    {
      name: "Liquid Fill Animation",
      component: <LiquidFillLoader />
    },
    {
      name: "Particle System",
      component: <ParticleLoader />
    },
    {
      name: "Space Mission Control",
      component: <SpaceMissionLoader />
    },
    {
      name: "Kitchen Chef Cooking",
      component: <ChefCookingLoader />
    },
    {
      name: "Lab Experiment",
      component: <LabExperimentLoader />
    },
    {
      name: "Garden Growing",
      component: <GardenGrowingLoader />
    },
    {
      name: "Blacksmith Forging",
      component: <BlacksmithLoader />
    },
    {
      name: "Film Reel Development",
      component: <FilmReelLoader />
    },
    {
      name: "DJ Mixing Console",
      component: <DJMixingLoader />
    },
    {
      name: "3D Printer Building",
      component: <PrinterBuildingLoader />
    },
    {
      name: "Weather Forecast",
      component: <WeatherForecastLoader />
    },
    {
      name: "Time Machine Portal",
      component: <TimeMachineLoader />
    }
  ];

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (!isAutoPlay) return;
    
    const interval = setInterval(() => {
      setCurrentLoader(prev => (prev + 1) % loaders.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlay, loaders.length]);

  const nextLoader = () => {
    setCurrentLoader(prev => (prev + 1) % loaders.length);
  };

  const prevLoader = () => {
    setCurrentLoader(prev => (prev - 1 + loaders.length) % loaders.length);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Loading Animation Showcase</h1>
          <p className="text-gray-300 text-lg">Choose your favorite loading animation for RoleBerry</p>
        </div>

        {/* Animation Display */}
        <div className="bg-gray-800 rounded-xl p-8 mb-8 min-h-96 flex items-center justify-center relative border border-gray-700">
          {loaders[currentLoader].component}
          
          {/* Navigation Arrows */}
          <button
            onClick={prevLoader}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-gray-700 hover:bg-gray-600 text-white p-3 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <button
            onClick={nextLoader}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-gray-700 hover:bg-gray-600 text-white p-3 rounded-full transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6 mb-8">
          <button
            onClick={() => setIsAutoPlay(!isAutoPlay)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {isAutoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isAutoPlay ? 'Pause' : 'Play'} Auto
          </button>
          
          <span className="text-white text-lg font-semibold">
            {currentLoader + 1} / {loaders.length}
          </span>
        </div>

        {/* Loader Info */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            {loaders[currentLoader].name}
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {loaders.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentLoader(index)}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index === currentLoader ? 'bg-blue-500' : 'bg-gray-600 hover:bg-gray-500'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Loading Animation Components
const PaperPlaneLoader = () => {
  return (
    <div className="relative w-full h-64 overflow-hidden">
      <div className="absolute inset-0 flex items-center">
        {/* Plane */}
        <div className="paper-plane animate-bounce">
          ✈️
        </div>
        {/* Trail */}
        <div className="ml-4 space-y-1">
          <div className="text-blue-400 text-sm animate-pulse">JavaScript</div>
          <div className="text-green-400 text-sm animate-pulse delay-100">React</div>
          <div className="text-purple-400 text-sm animate-pulse delay-200">Node.js</div>
        </div>
      </div>
      <style jsx>{`
        .paper-plane {
          font-size: 2rem;
          animation: fly 3s ease-in-out infinite;
        }
        @keyframes fly {
          0%, 100% { transform: translateX(0) translateY(0) rotate(0deg); }
          25% { transform: translateX(100px) translateY(-20px) rotate(10deg); }
          50% { transform: translateX(200px) translateY(0) rotate(0deg); }
          75% { transform: translateX(100px) translateY(20px) rotate(-10deg); }
        }
      `}</style>
    </div>
  );
};

const TypewriterLoader = () => {
  const [text, setText] = useState('');
  const fullText = 'JOHN DOE\nSoftware Engineer\n• React Developer\n• 5 years experience';
  
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setText(fullText.slice(0, index));
      index++;
      if (index > fullText.length) {
        index = 0;
        setText('');
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-600">
      <div className="text-green-400 font-mono text-lg whitespace-pre-line">
        {text}
        <span className="animate-pulse">|</span>
      </div>
    </div>
  );
};

const TetrisLoader = () => {
  return (
    <div className="relative">
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            className={`w-12 h-8 rounded flex items-center justify-center text-xs font-bold text-white animate-pulse ${
              i % 4 === 0 ? 'bg-blue-500' : i % 4 === 1 ? 'bg-green-500' : i % 4 === 2 ? 'bg-purple-500' : 'bg-orange-500'
            }`}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            {['JS', 'CSS', 'React', 'Node'][i % 4]}
          </div>
        ))}
      </div>
      <div className="text-center mt-4 text-white">Building your skills...</div>
    </div>
  );
};

const RobotLoader = () => {
  return (
    <div className="text-center">
      <div className="text-6xl mb-4 animate-bounce">🤖</div>
      <div className="flex justify-center space-x-2 mb-4">
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse delay-100"></div>
        <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse delay-200"></div>
      </div>
      <div className="text-white">Assembling your perfect CV...</div>
    </div>
  );
};

const MatrixLoader = () => {
  return (
    <div className="relative h-64 w-full overflow-hidden bg-black rounded">
      <div className="absolute inset-0">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="absolute text-green-400 text-sm font-mono animate-pulse"
            style={{
              left: `${(i * 5) % 100}%`,
              top: `${(i * 13) % 100}%`,
              animationDelay: `${i * 0.1}s`
            }}
          >
            {['React', 'Node.js', 'Python', 'AWS', 'Docker'][i % 5]}
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-green-400 font-bold">
        YOUR NAME
      </div>
    </div>
  );
};

const OrigamiLoader = () => {
  return (
    <div className="text-center">
      <div className="relative inline-block">
        <div className="w-32 h-32 bg-white transform rotate-45 animate-spin origin-center"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-800 font-bold transform -rotate-45">📄→💼</div>
        </div>
      </div>
      <div className="text-white mt-4">Folding your experience...</div>
    </div>
  );
};

const PixelLoader = () => {
  return (
    <div className="text-center">
      <div className="relative inline-block mb-4">
        <div className="text-6xl filter pixelated">👨‍💻</div>
        <div className="absolute -top-2 -right-2 text-2xl animate-bounce">⚡</div>
        <div className="absolute -bottom-2 -left-2 text-2xl animate-bounce delay-100">💻</div>
      </div>
      <div className="text-white">Level UP! Gaining experience...</div>
      <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
        <div className="bg-green-500 h-2 rounded-full animate-pulse" style={{ width: '75%' }}></div>
      </div>
      <style jsx>{`
        .pixelated {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }
      `}</style>
    </div>
  );
};

const SlotMachineLoader = () => {
  const [isSpinning, setIsSpinning] = React.useState([true, true, true]);
  const [showJackpot, setShowJackpot] = React.useState(false);

  const reelItems = [
    ['💻', '🔧', '📊', '🎯', '💡', '🚀'], // Skills
    ['📝', '👨‍💼', '🏆', '📈', '⭐', '💼'], // Experience  
    ['✨', '🎉', '💰', '🏅', '🌟', '🔥']  // Success
  ];

  const reelLabels = ['SKILLS', 'EXPERIENCE', 'SUCCESS'];

  React.useEffect(() => {
    // Stop reels one by one with realistic timing
    const stopTimeouts = [
      setTimeout(() => {
        setIsSpinning(prev => [false, prev[1], prev[2]]);
      }, 2000),
      setTimeout(() => {
        setIsSpinning(prev => [prev[0], false, prev[2]]);
      }, 2800),
      setTimeout(() => {
        setIsSpinning(prev => [prev[0], prev[1], false]);
        setShowJackpot(true);
      }, 3600)
    ];

    // Reset after showing jackpot
    const resetTimeout = setTimeout(() => {
      setIsSpinning([true, true, true]);
      setShowJackpot(false);
    }, 6000);

    return () => {
      stopTimeouts.forEach(clearTimeout);
      clearTimeout(resetTimeout);
    };
  }, []);

  const Reel = ({ items, isSpinning, reelIndex }) => {
    // Create a long strip with multiple repetitions for smooth spinning
    const reelStrip = [...items, ...items, ...items, ...items];
    
    return (
      <div className="bg-white border-4 border-gray-300 rounded-lg w-20 h-24 overflow-hidden relative shadow-inner">
        {/* Reel Strip */}
        <div 
          className={`absolute flex flex-col transition-transform ${isSpinning ? 'animate-spin-reel' : 'animate-stop-reel'}`}
          style={{
            transform: isSpinning ? 'translateY(0)' : `translateY(-${(items.length * 2 + Math.floor(Math.random() * items.length)) * 100}px)`,
            animationDuration: isSpinning ? `${0.1 + reelIndex * 0.02}s` : '0.8s',
            animationTimingFunction: isSpinning ? 'linear' : 'cubic-bezier(0.23, 1, 0.32, 1)',
            top: '-200px'
          }}
        >
          {reelStrip.map((item, index) => (
            <div 
              key={index} 
              className="h-24 flex items-center justify-center text-4xl font-bold"
              style={{ minHeight: '96px' }}
            >
              {item}
            </div>
          ))}
        </div>
        
        {/* Reel Window Highlight */}
        <div className="absolute inset-0 border-2 border-yellow-400 rounded pointer-events-none"></div>
        
        {/* Center Line Indicator */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 transform -translate-y-0.5 opacity-60"></div>
        
        {/* Reel Label */}
        <div className="absolute bottom-0 left-0 right-0 bg-gray-800 text-yellow-400 text-xs font-bold py-1 text-center">
          {reelLabels[reelIndex]}
        </div>
        
        {/* Spinning Blur Effect */}
        {isSpinning && (
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-white/20 animate-pulse"></div>
        )}
      </div>
    );
  };

  return (
    <div className="text-center">
      {/* Slot Machine Frame */}
      <div className="bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-600 p-6 rounded-2xl shadow-2xl mx-auto max-w-md border-4 border-yellow-300">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 p-6 rounded-xl shadow-inner">
          {/* Machine Title */}
          <div className="text-yellow-400 font-bold text-xl mb-4 tracking-wider text-center border-b border-yellow-600 pb-2">
            🎰 CV OPTIMIZER 🎰
          </div>
          
          {/* Reels Container */}
          <div className="flex justify-center space-x-3 mb-6 bg-gray-700 p-4 rounded-lg">
            {reelItems.map((items, reelIndex) => (
              <Reel 
                key={reelIndex}
                items={items}
                isSpinning={isSpinning[reelIndex]}
                reelIndex={reelIndex}
              />
            ))}
          </div>

          {/* Jackpot Animation */}
          {showJackpot && (
            <div className="animate-bounce mb-4">
              <div className="text-yellow-400 text-2xl font-bold mb-2 animate-pulse tracking-wider">
                🎉 JACKPOT! 🎉
              </div>
              <div className="text-green-400 font-semibold text-lg">
                Perfect CV Match Found!
              </div>
            </div>
          )}
          
          {/* Loading Message */}
          {!showJackpot && (
            <div className="text-white text-center">
              {isSpinning.every(spinning => spinning) ? 
                'Spinning for your perfect match...' : 
                isSpinning.some(spinning => spinning) ?
                'Locking in results...' :
                'Calculating final score...'
              }
            </div>
          )}
          
          {/* LED Lights Effect */}
          <div className="flex justify-center space-x-2 mt-4">
            {[0, 1, 2].map(i => (
              <div 
                key={i}
                className={`w-3 h-3 rounded-full ${
                  isSpinning[i] ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                } shadow-lg`}
              ></div>
            ))}
          </div>
        </div>
        
        {/* Machine Base with Coin Slot */}
        <div className="bg-gradient-to-b from-gray-400 to-gray-600 h-6 rounded-b-xl relative">
          <div className="absolute top-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-gray-800 rounded"></div>
        </div>
      </div>

      {/* Coins Falling Effect */}
      {showJackpot && (
        <div className="relative mt-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="absolute text-yellow-400 text-2xl animate-bounce"
              style={{
                left: `${10 + i * 7}%`,
                animationDelay: `${i * 0.15}s`,
                animationDuration: '1.2s'
              }}
            >
              🪙
            </div>
          ))}
        </div>
      )}
      
      <style jsx>{`
        @keyframes spin-reel {
          from { transform: translateY(0); }
          to { transform: translateY(-400px); }
        }
        
        @keyframes stop-reel {
          from { transform: translateY(0); }
          to { transform: translateY(var(--final-position, -300px)); }
        }
        
        .animate-spin-reel {
          animation: spin-reel 0.1s linear infinite;
        }
        
        .animate-stop-reel {
          animation: stop-reel 0.8s cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }
      `}</style>
    </div>
  );
};

// ========== NEW 20 LOADERS ==========

// 1. Document Assembly Line
const AssemblyLineLoader = () => {
  return (
    <div className="relative bg-gray-800 rounded-lg p-6 overflow-hidden">
      <div className="text-white text-center mb-4 font-bold">CV Assembly Line</div>
      
      {/* Conveyor Belt */}
      <div className="relative h-20 bg-gray-600 rounded mb-4 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 animate-pulse"></div>
        
        {/* Moving CV Documents */}
        {Array.from({length: 3}, (_, i) => (
          <div
            key={i}
            className="absolute top-2 w-12 h-16 bg-white rounded shadow-lg border-2 border-gray-300 animate-bounce"
            style={{
              left: `${20 + i * 30}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: '2s'
            }}
          >
            <div className="p-1 text-xs text-gray-800">
              <div className="w-full h-1 bg-gray-400 mb-1"></div>
              <div className="w-3/4 h-1 bg-gray-400 mb-1"></div>
              <div className="w-full h-1 bg-gray-400"></div>
            </div>
          </div>
        ))}
        
        {/* Robot Arms */}
        <div className="absolute top-0 right-4 w-8 h-8 bg-blue-500 rounded animate-ping"></div>
      </div>
      
      <div className="text-green-400 text-sm animate-pulse">Assembling your perfect CV...</div>
    </div>
  );
};

// 2. Code Editor Typing
const CodeEditorLoader = () => {
  const [code, setCode] = React.useState('');
  const fullCode = `const cv = {
  name: "John Doe",
  skills: ["React", "Node.js"],
  experience: "5 years",
  status: "OPTIMIZED"
};`;

  React.useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setCode(fullCode.slice(0, index));
      index++;
      if (index > fullCode.length) {
        index = 0;
        setCode('');
      }
    }, 80);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gray-900 rounded-lg p-4 font-mono">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        <span className="text-gray-400 text-sm ml-2">cv-optimizer.js</span>
      </div>
      
      <div className="text-green-400 text-sm whitespace-pre-line">
        {code}
        <span className="animate-blink">|</span>
      </div>
      
      <style jsx>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s infinite;
        }
      `}</style>
    </div>
  );
};

// 3. Neural Network
const NeuralNetworkLoader = () => {
  return (
    <div className="relative bg-black rounded-lg p-6 overflow-hidden">
      <div className="text-white text-center mb-4 font-bold">AI Neural Network</div>
      
      {/* Neurons */}
      <div className="relative h-48">
        {/* Input Layer */}
        <div className="absolute left-4 top-0 space-y-8">
          {Array.from({length: 4}, (_, i) => (
            <div key={i} className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: `${i * 0.2}s`}}></div>
          ))}
        </div>
        
        {/* Hidden Layer */}
        <div className="absolute left-1/2 top-0 transform -translate-x-1/2 space-y-6">
          {Array.from({length: 5}, (_, i) => (
            <div key={i} className="w-4 h-4 bg-purple-500 rounded-full animate-ping" style={{animationDelay: `${i * 0.15}s`}}></div>
          ))}
        </div>
        
        {/* Output Layer */}
        <div className="absolute right-4 top-8 space-y-12">
          {Array.from({length: 3}, (_, i) => (
            <div key={i} className="w-4 h-4 bg-green-500 rounded-full animate-bounce" style={{animationDelay: `${i * 0.3}s`}}></div>
          ))}
        </div>
        
        {/* Connections */}
        <svg className="absolute inset-0 w-full h-full">
          {Array.from({length: 12}, (_, i) => (
            <line
              key={i}
              x1={Math.random() * 20 + 40}
              y1={Math.random() * 160 + 20}
              x2={Math.random() * 20 + 200}
              y2={Math.random() * 160 + 20}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              className="animate-pulse"
              style={{animationDelay: `${i * 0.1}s`}}
            />
          ))}
        </svg>
      </div>
      
      <div className="text-cyan-400 text-sm text-center animate-pulse">Processing your data...</div>
    </div>
  );
};

// 4. Progress Bars Race
const ProgressRaceLoader = () => {
  const skills = ['JavaScript', 'React', 'Node.js', 'Python', 'AWS'];
  
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="text-white text-center mb-4 font-bold">Skills Race</div>
      
      <div className="space-y-3">
        {skills.map((skill, index) => (
          <div key={skill} className="flex items-center gap-3">
            <span className="text-white text-sm w-20">{skill}</span>
            <div className="flex-1 bg-gray-600 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full animate-pulse"
                style={{
                  width: `${Math.random() * 40 + 60}%`,
                  animationDelay: `${index * 0.2}s`,
                  animationDuration: '2s'
                }}
              ></div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-yellow-400 text-sm text-center mt-4 animate-bounce">Racing to 100%...</div>
    </div>
  );
};

// 5. DNA Helix
const DNAHelixLoader = () => {
  return (
    <div className="relative bg-gray-900 rounded-lg p-6 overflow-hidden">
      <div className="text-white text-center mb-4 font-bold">DNA of Skills</div>
      
      <div className="relative h-40 flex items-center justify-center">
        <div className="relative w-32 h-32">
          {/* DNA Strands */}
          {Array.from({length: 8}, (_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-blue-400 rounded-full animate-spin"
              style={{
                left: `${Math.cos(i * Math.PI / 4) * 40 + 40}px`,
                top: `${Math.sin(i * Math.PI / 4) * 40 + 40}px`,
                animationDelay: `${i * 0.2}s`,
                animationDuration: '3s'
              }}
            ></div>
          ))}
          
          {Array.from({length: 8}, (_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-green-400 rounded-full animate-spin"
              style={{
                left: `${Math.cos(i * Math.PI / 4 + Math.PI) * 40 + 40}px`,
                top: `${Math.sin(i * Math.PI / 4 + Math.PI) * 40 + 40}px`,
                animationDelay: `${i * 0.2}s`,
                animationDuration: '3s'
              }}
            ></div>
          ))}
          
          {/* Center */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full animate-ping"></div>
        </div>
      </div>
      
      <div className="text-green-400 text-sm text-center animate-pulse">Decoding your genetic career profile...</div>
    </div>
  );
};

// 6. Circuit Board Paths
const CircuitBoardLoader = () => {
  return (
    <div className="relative bg-green-900 rounded-lg p-6 overflow-hidden">
      <div className="text-green-400 text-center mb-4 font-bold">Circuit Board</div>
      
      <div className="relative h-40">
        {/* Circuit Paths */}
        <svg className="absolute inset-0 w-full h-full">
          {/* Horizontal Lines */}
          {Array.from({length: 6}, (_, i) => (
            <line
              key={i}
              x1="0"
              y1={i * 30 + 20}
              x2="100%"
              y2={i * 30 + 20}
              stroke="#10b981"
              strokeWidth="2"
              className="animate-pulse"
              style={{animationDelay: `${i * 0.1}s`}}
            />
          ))}
          
          {/* Vertical Lines */}
          {Array.from({length: 8}, (_, i) => (
            <line
              key={i}
              x1={i * 40 + 20}
              y1="0"
              x2={i * 40 + 20}
              y2="100%"
              stroke="#10b981"
              strokeWidth="2"
              className="animate-pulse"
              style={{animationDelay: `${i * 0.15}s`}}
            />
          ))}
        </svg>
        
        {/* Circuit Nodes */}
        {Array.from({length: 12}, (_, i) => (
          <div
            key={i}
            className="absolute w-3 h-3 bg-yellow-400 rounded-full animate-ping"
            style={{
              left: `${Math.random() * 80 + 10}%`,
              top: `${Math.random() * 80 + 10}%`,
              animationDelay: `${i * 0.2}s`
            }}
          ></div>
        ))}
      </div>
      
      <div className="text-green-400 text-sm text-center animate-pulse">Connecting neural pathways...</div>
    </div>
  );
};

// 7. Puzzle Assembly
const PuzzleLoader = () => {
  return (
    <div className="bg-purple-900 rounded-lg p-6">
      <div className="text-white text-center mb-4 font-bold">Puzzle Assembly</div>
      
      <div className="relative h-40 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-2">
          {Array.from({length: 9}, (_, i) => (
            <div
              key={i}
              className={`w-12 h-12 rounded border-2 border-white/30 flex items-center justify-center text-xs font-bold text-white animate-bounce ${
                i % 3 === 0 ? 'bg-blue-600' : i % 3 === 1 ? 'bg-green-600' : 'bg-purple-600'
              }`}
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: '1.5s'
              }}
            >
              {['EXP', 'SKILL', 'GOAL', 'TEAM', 'LEAD', 'CODE', 'THINK', 'SOLVE', 'WIN'][i]}
            </div>
          ))}
        </div>
      </div>
      
      <div className="text-purple-300 text-sm text-center animate-pulse">Assembling the perfect picture...</div>
    </div>
  );
};

// 8. Radar Scanning
const RadarLoader = () => {
  return (
    <div className="relative bg-gray-900 rounded-lg p-6 overflow-hidden">
      <div className="text-green-400 text-center mb-4 font-bold">Talent Radar</div>
      
      <div className="relative h-40 flex items-center justify-center">
        <div className="relative w-32 h-32 rounded-full border-2 border-green-500">
          {/* Radar Circles */}
          {Array.from({length: 3}, (_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-green-400/30"
              style={{
                width: `${(i + 1) * 33}%`,
                height: `${(i + 1) * 33}%`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
              }}
            ></div>
          ))}
          
          {/* Radar Sweep */}
          <div className="absolute top-1/2 left-1/2 w-16 h-0.5 bg-gradient-to-r from-green-500 to-transparent origin-left animate-spin transform -translate-y-0.5"></div>
          
          {/* Blips */}
          {Array.from({length: 5}, (_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-ping"
              style={{
                left: `${Math.random() * 60 + 20}%`,
                top: `${Math.random() * 60 + 20}%`,
                animationDelay: `${i * 0.5}s`
              }}
            ></div>
          ))}
        </div>
      </div>
      
      <div className="text-green-400 text-sm text-center animate-pulse">Scanning for opportunities...</div>
    </div>
  );
};

// 9. Liquid Fill
const LiquidFillLoader = () => {
  const containers = ['Skills', 'Experience', 'Potential'];
  
  return (
    <div className="bg-blue-900 rounded-lg p-6">
      <div className="text-white text-center mb-4 font-bold">Skill Containers</div>
      
      <div className="flex justify-center gap-4">
        {containers.map((label, index) => (
          <div key={label} className="text-center">
            <div className="relative w-16 h-24 bg-gray-300 rounded-lg border-2 border-gray-400 overflow-hidden">
              <div
                className={`absolute bottom-0 left-0 right-0 animate-pulse ${
                  index === 0 ? 'bg-blue-500' : index === 1 ? 'bg-green-500' : 'bg-purple-500'
                }`}
                style={{
                  height: `${60 + Math.random() * 30}%`,
                  animationDelay: `${index * 0.3}s`,
                  animationDuration: '2s'
                }}
              ></div>
              
              {/* Bubbles */}
              {Array.from({length: 3}, (_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 bg-white rounded-full animate-bounce"
                  style={{
                    left: `${20 + i * 20}%`,
                    bottom: `${10 + i * 15}%`,
                    animationDelay: `${i * 0.2}s`
                  }}
                ></div>
              ))}
            </div>
            <div className="text-white text-xs mt-2">{label}</div>
          </div>
        ))}
      </div>
      
      <div className="text-blue-300 text-sm text-center mt-4 animate-pulse">Mixing the perfect formula...</div>
    </div>
  );
};

// 10. Particle System
const ParticleLoader = () => {
  return (
    <div className="relative bg-black rounded-lg p-6 overflow-hidden">
      <div className="text-white text-center mb-4 font-bold">Particle Formation</div>
      
      <div className="relative h-40">
        {/* Particles */}
        {Array.from({length: 50}, (_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-ping"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1 + Math.random()}s`
            }}
          ></div>
        ))}
        
        {/* Central Formation */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="text-2xl font-bold text-cyan-400 animate-pulse">CV</div>
        </div>
      </div>
      
      <div className="text-cyan-400 text-sm text-center animate-pulse">Particles forming your future...</div>
    </div>
  );
};

// 11-20: Emoji-Enhanced Loaders
const SpaceMissionLoader = () => (
  <div className="bg-indigo-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">🚀 Space Mission Control</div>
    <div className="text-6xl animate-bounce mb-4">🚀</div>
    <div className="text-yellow-400 animate-pulse">Launching career to orbit...</div>
  </div>
);

const ChefCookingLoader = () => (
  <div className="bg-orange-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">👨‍🍳 Chef's Kitchen</div>
    <div className="text-6xl animate-spin mb-4">🍳</div>
    <div className="text-orange-300 animate-pulse">Cooking up your perfect CV...</div>
  </div>
);

const LabExperimentLoader = () => (
  <div className="bg-green-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">🧪 Lab Experiment</div>
    <div className="text-6xl animate-bounce mb-4">🧪</div>
    <div className="text-green-300 animate-pulse">Mixing success formula...</div>
  </div>
);

const GardenGrowingLoader = () => (
  <div className="bg-green-800 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">🌱 Career Garden</div>
    <div className="text-6xl animate-pulse mb-4">🌳</div>
    <div className="text-green-300 animate-bounce">Growing your potential...</div>
  </div>
);

const BlacksmithLoader = () => (
  <div className="bg-red-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">⚒️ CV Forge</div>
    <div className="text-6xl animate-bounce mb-4">⚒️</div>
    <div className="text-red-300 animate-pulse">Forging your destiny...</div>
  </div>
);

const FilmReelLoader = () => (
  <div className="bg-gray-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">🎬 Your Story</div>
    <div className="text-6xl animate-spin mb-4">🎬</div>
    <div className="text-yellow-300 animate-pulse">Directing your success story...</div>
  </div>
);

const DJMixingLoader = () => (
  <div className="bg-purple-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">🎧 DJ Career Mix</div>
    <div className="text-6xl animate-bounce mb-4">🎧</div>
    <div className="text-purple-300 animate-pulse">Mixing the perfect track...</div>
  </div>
);

const PrinterBuildingLoader = () => (
  <div className="bg-blue-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">🖨️ 3D Printing</div>
    <div className="text-6xl animate-pulse mb-4">🖨️</div>
    <div className="text-blue-300 animate-bounce">Building layer by layer...</div>
  </div>
);

const WeatherForecastLoader = () => (
  <div className="bg-sky-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">🌤️ Career Forecast</div>
    <div className="text-6xl animate-pulse mb-4">⛅</div>
    <div className="text-sky-300 animate-bounce">100% chance of success!</div>
  </div>
);

const TimeMachineLoader = () => (
  <div className="bg-violet-900 rounded-lg p-6 text-center">
    <div className="text-white font-bold mb-4">⏰ Time Portal</div>
    <div className="text-6xl animate-spin mb-4">🌀</div>
    <div className="text-violet-300 animate-pulse">Traveling to your bright future...</div>
  </div>
);

export default LoadingShowcase;
