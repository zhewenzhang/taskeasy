
import React from 'react';
import { Task, QuadrantType } from '../types';
import { AlertCircle, Calendar, Trash2, CheckCircle2, Clock, Check } from 'lucide-react';

interface MatrixProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

export const Matrix: React.FC<MatrixProps> = ({ tasks, onTaskClick }) => {
  
  const getTasksForQuadrant = (type: QuadrantType) => tasks.filter(t => t.quadrant === type);

  const renderQuadrant = (
    type: QuadrantType, 
    title: string, 
    subTitle: string, 
    icon: React.ReactNode, 
    styles: {
      text: string;
      bg: string;
      border: string;
      cardBg: string;
      iconBg: string;
    }
  ) => {
    const quadrantTasks = getTasksForQuadrant(type);
    
    return (
      <div className={`relative p-4 md:p-6 flex flex-col h-full min-h-[300px] md:min-h-0 transition-all duration-300 ${styles.bg} ${styles.border}`}>
        {/* Header Area */}
        <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 opacity-100 shrink-0">
          <div className={`p-2 md:p-3 rounded-xl shadow-sm ${styles.iconBg} ${styles.text}`}>
             {icon}
          </div>
          <div>
            <h4 className={`font-bold text-lg md:text-xl tracking-tight ${styles.text}`}>{title}</h4>
            <p className="text-xs md:text-sm text-slate-500 font-medium dark:text-slate-400">{subTitle}</p>
          </div>
        </div>
        
        {/* Task List Area */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 md:pr-2 custom-scrollbar pb-4 md:pb-0">
          {quadrantTasks.length === 0 && (
            <div className="h-32 md:h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm italic border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/50 dark:bg-slate-900/20">
              暂无任务
            </div>
          )}
          {quadrantTasks.map(task => (
            <div 
              key={task.id}
              onClick={(e) => {
                e.stopPropagation(); // Prevent bubbling
                onTaskClick && onTaskClick(task);
              }}
              className={`group cursor-pointer border p-3 md:p-4 rounded-xl shadow-sm transition-all duration-200 relative overflow-hidden
                ${task.isCompleted 
                  ? 'bg-slate-100 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-75 grayscale hover:grayscale-0 hover:opacity-100' 
                  : `${styles.cardBg} border-slate-200 dark:border-slate-700 hover:shadow-md hover:-translate-y-0.5`
                }
              `}
            >
              {task.isCompleted && (
                <div className="absolute top-0 right-0 p-1.5 bg-emerald-100 dark:bg-emerald-500/10 rounded-bl-lg">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
                </div>
              )}
              
              <div className="flex justify-between items-start mb-2 pr-4">
                <span className={`text-sm md:text-base font-semibold leading-snug line-clamp-2 transition-colors 
                  ${task.isCompleted 
                    ? 'text-slate-500 line-through decoration-slate-400' 
                    : 'text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white'
                  }`}>
                  {task.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-200/50 dark:bg-slate-900/50 inline-flex px-2 py-1 rounded-md">
                <Clock className="w-3 h-3" /> 
                <span>截止: {task.estimatedTime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    // Responsive Container: Standard block on mobile, Fixed height on desktop
    <div className="w-full h-auto md:h-[calc(100vh-180px)] min-h-[600px] relative bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-none flex flex-col">
      <div className="grid grid-cols-1 md:grid-cols-2 grid-rows-4 md:grid-rows-2 h-full w-full">
        {/* Q1: Do */}
        {renderQuadrant(
          QuadrantType.DO, 
          "马上做 (Do)", 
          "重要且紧急", 
          <AlertCircle className="w-6 h-6 md:w-7 md:h-7" />, 
          {
            text: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-50/30 dark:bg-slate-900/50",
            border: "border-b border-slate-200 dark:border-slate-800 md:border-r",
            cardBg: "bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700",
            iconBg: "bg-white dark:bg-slate-950 border border-blue-100 dark:border-slate-800"
          }
        )}

        {/* Q2: Plan */}
        {renderQuadrant(
          QuadrantType.PLAN, 
          "计划做 (Plan)", 
          "重要不紧急", 
          <Calendar className="w-6 h-6 md:w-7 md:h-7" />, 
          {
            text: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-50/30 dark:bg-slate-900/30",
            border: "border-b border-slate-200 dark:border-slate-800",
            cardBg: "bg-white dark:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700",
            iconBg: "bg-white dark:bg-slate-950 border border-emerald-100 dark:border-slate-800"
          }
        )}

        {/* Q3: Delegate */}
        {renderQuadrant(
          QuadrantType.DELEGATE, 
          "授权做 (Delegate)", 
          "不重要紧急", 
          <CheckCircle2 className="w-6 h-6 md:w-7 md:h-7" />, 
          {
            text: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50/30 dark:bg-slate-900/30",
            border: "border-b border-slate-200 dark:border-slate-800 md:border-b-0 md:border-r",
            cardBg: "bg-white dark:bg-slate-800 hover:border-amber-300 dark:hover:border-amber-700",
            iconBg: "bg-white dark:bg-slate-950 border border-amber-100 dark:border-slate-800"
          }
        )}

        {/* Q4: Eliminate */}
        {renderQuadrant(
          QuadrantType.ELIMINATE, 
          "减少做 (Eliminate)", 
          "不重要不紧急", 
          <Trash2 className="w-6 h-6 md:w-7 md:h-7" />, 
          {
            text: "text-rose-600 dark:text-rose-400",
            bg: "bg-rose-50/30 dark:bg-slate-900/10",
            border: "",
            cardBg: "bg-white dark:bg-slate-800 hover:border-rose-300 dark:hover:border-rose-700",
            iconBg: "bg-white dark:bg-slate-950 border border-rose-100 dark:border-slate-800"
          }
        )}
      </div>
    </div>
  );
};
