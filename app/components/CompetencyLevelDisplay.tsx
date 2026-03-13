/**
 * ALIA 2.0 - Competency Level Display Component
 * Displays current competency level, progression, and recommendations
 */

import { useEffect, useState } from 'react';
import type { CompetencyLevel } from '~/lib/competency-level.server';

export interface CompetencyLevelDisplayProps {
  repId: string;
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
  showRecommendations?: boolean;
}

export function CompetencyLevelDisplay({
  repId,
  size = 'medium',
  showProgress = true,
  showRecommendations = false,
}: CompetencyLevelDisplayProps) {
  const [currentLevel, setCurrentLevel] = useState<CompetencyLevel | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLevelData() {
      try {
        setLoading(true);
        setError(null);
        setProgressError(null);
        setRecommendationsError(null);

        // Load current level — failure is fatal for this component
        const levelRes = await fetch(`/api/competency-level?rep_id=${encodeURIComponent(repId)}&type=current`);
        if (!levelRes.ok) throw new Error('Failed to load competency level');
        const levelData = await levelRes.json();
        setCurrentLevel(levelData.currentLevel);

        // Load progression progress — non-fatal, surface error separately
        const progRes = await fetch(`/api/competency-level?rep_id=${encodeURIComponent(repId)}&type=progression`);
        if (progRes.ok) {
          const progData = await progRes.json();
          setProgress(progData.progress);
        } else {
          const progErrText = await progRes.text().catch(() => `HTTP ${progRes.status}`);
          const progErrMsg = `Failed to load progression (${progRes.status}): ${progErrText}`;
          console.error(progErrMsg);
          setProgressError(progErrMsg);
        }

        // Load recommendations if requested — non-fatal, surface error separately
        if (showRecommendations) {
          const recsRes = await fetch(`/api/competency-level?rep_id=${encodeURIComponent(repId)}&type=recommendations`);
          if (recsRes.ok) {
            const recsData = await recsRes.json();
            setRecommendations(recsData.recommendations);
          } else {
            const recsErrText = await recsRes.text().catch(() => `HTTP ${recsRes.status}`);
            const recsErrMsg = `Failed to load recommendations (${recsRes.status}): ${recsErrText}`;
            console.error(recsErrMsg);
            setRecommendationsError(recsErrMsg);
          }
        }
      } catch (err: any) {
        console.error('Error loading competency level:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadLevelData();
  }, [repId, showRecommendations]);

  // Size variants
  const sizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  };

  const iconSize = size === 'small' ? 'w-4 h-4' : size === 'medium' ? 'w-6 h-6' : 'w-8 h-8';

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-gray-500">
        <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 ${iconSize}`}></div>
        <span className={sizeClasses[size]}>Loading level...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 text-sm">
        Error: {error}
      </div>
    );
  }

  if (!currentLevel) {
    return (
      <div className="text-gray-400 text-sm">
        No level assigned
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Level Display */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Current Level</div>
            <div className="flex items-center space-x-2 mt-1">
              <div className={`bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full ${iconSize} flex items-center justify-center font-bold`}>
                {currentLevel.level_number}
              </div>
              <div>
                <div className="font-semibold text-gray-900">{currentLevel.level_name_fr}</div>
                <div className="text-xs text-gray-500">{currentLevel.level_name_en}</div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Score</div>
            <div className="text-2xl font-bold text-indigo-600">
              {currentLevel.average_score}/10
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {showProgress && progress && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progress to {progress.nextLevel}</span>
              <span>{progress.progressPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress.progressPercentage}%` }}
              ></div>
            </div>
            {progress.remainingSessions > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {progress.remainingSessions} more session{progress.remainingSessions > 1 ? 's' : ''} required
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key Skills */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Key Skills</div>
        <div className="flex flex-wrap gap-2">
          {currentLevel.key_skills.map((skill, index) => (
            <span
              key={index}
              className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {showRecommendations && recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recommendations</div>
          <div className="space-y-3">
            {recommendations.slice(0, 3).map((rec, index) => (
              <div key={index} className="border-l-4 border-indigo-500 pl-3">
                <div className="font-medium text-gray-900 text-sm">
                  {rec.recommended_level_code}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {rec.recommendation_reason}
                </div>
                {rec.focus_areas && rec.focus_areas.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500 mb-1">Focus areas:</div>
                    <div className="flex flex-wrap gap-1">
                      {rec.focus_areas.map((area: string, i: number) => (
                        <span key={i} className="text-xs text-gray-600">
                          • {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// LEVEL BADGE COMPONENT
// =====================================================

export interface LevelBadgeProps {
  levelCode: string;
  size?: 'small' | 'medium' | 'large';
}

export function LevelBadge({ levelCode, size = 'medium' }: LevelBadgeProps) {
  const levelMap: Record<string, { name: string; color: string; description: string }> = {
    BEGINNER: {
      name: 'Débutant',
      color: 'bg-gray-100 text-gray-800',
      description: 'Basic training',
    },
    JUNIOR: {
      name: 'Junior',
      color: 'bg-blue-100 text-blue-800',
      description: 'Intermediate',
    },
    CONFIRMED: {
      name: 'Confirmé',
      color: 'bg-green-100 text-green-800',
      description: 'Advanced',
    },
    EXPERT: {
      name: 'Expert',
      color: 'bg-purple-100 text-purple-800',
      description: 'Master',
    },
  };

  const level = levelMap[levelCode] || levelMap.BEGINNER;
  const sizeClasses = {
    small: 'px-2 py-0.5 text-xs',
    medium: 'px-3 py-1 text-sm',
    large: 'px-4 py-1.5 text-base',
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full font-medium ${level.color} ${sizeClasses[size]}`}
    >
      <span className={`w-2 h-2 rounded-full bg-current mr-2 ${size === 'small' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'}`}></span>
      {level.name}
    </span>
  );
}

// =====================================================
// PROGRESS BAR COMPONENT
// =====================================================

export interface ProgressBarProps {
  current: number;
  target: number;
  label?: string;
  size?: 'small' | 'medium' | 'large';
}

export function ProgressBar({ current, target, label, size = 'medium' }: ProgressBarProps) {
  const percentage = target <= 0 ? 0 : Math.min(100, Math.round((current / target) * 100));
  const sizeClasses = {
    small: 'h-1.5',
    medium: 'h-2',
    large: 'h-3',
  };
  const textClasses = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base',
  };

  return (
    <div className="space-y-1">
      {label && (
        <div className={`flex justify-between ${textClasses[size]}`}>
          <span className="text-gray-600">{label}</span>
          <span className="font-medium text-gray-900">{percentage}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${sizeClasses[size]}`}>
        <div
          className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}
