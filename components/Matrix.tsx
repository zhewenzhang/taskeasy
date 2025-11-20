
import React from 'react';
import { Task, QuadrantType } from '../types';
import { AlertCircle, Calendar, Trash2, CheckCircle2, Clock } from 'lucide-react';

interface MatrixProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

export const Matrix: React.FC<MatrixProps> = ({ tasks, onTaskClick }) => {
  
  const getTasksForQuadrant = (type: QuadrantType) => tasks.filter(t => t.quadrant === type);

  const renderQuadrant = (type: QuadrantType, title: string, subTitle: string, icon: React.ReactNode, colorClass: string, borderClass: string, bgClass: string) => {
    const quadrantTasks = getTasksForQuadrant(type);
    
    return (
      <div className={`relative p-6 border-slate-800 flex flex-col h-full transition-all duration-300 ${borderClass} ${bgClass}`}>
        {/* Header Area */}
        <div className="flex items-center gap-4 mb-6 opacity-90 shrink-0">
          <div className={`p-3 rounded-xl bg-slate-950 border border-slate-800 shadow-sm ${colorClass}`}>
             {icon}
          </div>
          <div>
            <h4 className={`font-bold text-xl tracking-tight ${colorClass}`}>{title}</h4>
            <p className="text-sm text-slate-500 font-medium">{subTitle}</p>
          </div>
        </div>
        
        {/* Task List Area */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {quadrantTasks.length === 0 && (
            <div className="h-full flex items-center justify-center text-slate-600 text-base italic border-2 border-dashed border-slate-800/50 rounded-xl bg-slate-900/20">
              暂无任务
            </div>
          )}
          {quadrantTasks.map(task => (
            <div 
              key={task.id}
              onClick={() => onTaskClick && onTaskClick(task)}
              className="group cursor-pointer bg-slate-800 border border-slate-700/50 p-4 rounded-lg shadow-sm hover:bg-slate-700 hover:border-slate-600 hover:shadow-md transition-all duration-200"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-slate-200 text-base font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">{task.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium bg-slate-900/50 inline-flex px-2 py-1 rounded">
                <Clock className="w-3.5 h-3.5" /> 
                <span>截止: {task.estimatedTime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-[78vh] relative bg-[#1e293b] border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
      <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
        {/* Q1: Do */}
        {renderQuadrant(
          QuadrantType.DO, 
          "马上做 (Do)", 
          "重要且紧急", 
          <AlertCircle className="w-7 h-7" />, 
          "text-blue-400",
          "border-r border-b",
          "bg-slate-900/50 hover:bg-slate-900/80"
        )}

        {/* Q2: Plan */}
        {renderQuadrant(
          QuadrantType.PLAN, 
          "计划做 (Plan)", 
          "重要不紧急", 
          <Calendar className="w-7 h-7" />, 
          "text-emerald-400",
          "border-b",
          "bg-slate-900/30 hover:bg-slate-900/60"
        )}

        {/* Q3: Delegate */}
        {renderQuadrant(
          QuadrantType.DELEGATE, 
          "授权做 (Delegate)", 
          "不重要紧急", 
          <CheckCircle2 className="w-7 h-7" />, 
          "text-amber-400",
          "border-r",
          "bg-slate-900/30 hover:bg-slate-900/60"
        )}

        {/* Q4: Eliminate */}
        {renderQuadrant(
          QuadrantType.ELIMINATE, 
          "减少做 (Eliminate)", 
          "不重要不紧急", 
          <Trash2 className="w-7 h-7" />, 
          "text-rose-400",
          "",
          "bg-slate-900/10 hover:bg-slate-900/40"
        )}
      </div>
    </div>
  );
};
