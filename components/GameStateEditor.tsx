'use client';

import React, { useState } from 'react';
import { GameState } from '@/types/baseball';

interface GameStateEditorProps {
  gameState: GameState;
  onSave: (newGameState: GameState) => void;
  onCancel: () => void;
}

export default function GameStateEditor({ gameState, onSave, onCancel }: GameStateEditorProps) {
  const [editedState, setEditedState] = useState<GameState>({ ...gameState });

  const handleSave = () => {
    onSave(editedState);
  };

  const updateField = (field: keyof GameState, value: any) => {
    setEditedState(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateBase = (base: 'first' | 'second' | 'third', occupied: boolean) => {
    setEditedState(prev => ({
      ...prev,
      bases: {
        ...prev.bases,
        [base]: occupied
      }
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Edit Game State</h2>
        
        <div className="space-y-4">
          {/* Scores */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Away Score
              </label>
              <input
                type="number"
                min="0"
                value={editedState.awayScore}
                onChange={(e) => updateField('awayScore', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Home Score
              </label>
              <input
                type="number"
                min="0"
                value={editedState.homeScore}
                onChange={(e) => updateField('homeScore', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Inning */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inning
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={editedState.inning}
                onChange={(e) => updateField('inning', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Half Inning
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateField('isTopOfInning', true)}
                  className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    editedState.isTopOfInning
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => updateField('isTopOfInning', false)}
                  className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    !editedState.isTopOfInning
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Bottom
                </button>
              </div>
            </div>
          </div>

          {/* Count */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Balls
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[0, 1, 2, 3].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => updateField('balls', count)}
                    className={`py-2 px-2 rounded-md text-sm font-medium transition-all ${
                      editedState.balls === count
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strikes
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => updateField('strikes', count)}
                    className={`py-2 px-2 rounded-md text-sm font-medium transition-all ${
                      editedState.strikes === count
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Outs
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => updateField('outs', count)}
                    className={`py-2 px-2 rounded-md text-sm font-medium transition-all ${
                      editedState.outs === count
                        ? 'bg-orange-600 text-white shadow-md'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bases */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Base Runners
            </label>
            <div className="grid grid-cols-3 gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={editedState.bases.first}
                  onChange={(e) => updateBase('first', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">First Base</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={editedState.bases.second}
                  onChange={(e) => updateBase('second', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">Second Base</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={editedState.bases.third}
                  onChange={(e) => updateBase('third', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">Third Base</span>
              </label>
            </div>
          </div>

          {/* Team Names */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Away Team
              </label>
              <input
                type="text"
                value={editedState.awayTeam}
                onChange={(e) => updateField('awayTeam', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Home Team
              </label>
              <input
                type="text"
                value={editedState.homeTeam}
                onChange={(e) => updateField('homeTeam', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Save Changes
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}