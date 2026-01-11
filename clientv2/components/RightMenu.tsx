'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ToggleMenuIcon, LeftMenuLogo } from '@/components/icons'

export function RightMenu() {
    const [isExpanded, setIsExpanded] = React.useState(false)

    const toggleMenu = () => {
        setIsExpanded(!isExpanded)
    }

    return (
        <aside
            className={cn(
                'relative flex flex-col items-center transition-all duration-300 ease-in-out',
                'h-[974px] opacity-100 overflow-visible shadow-[0px_4px_4px_0px_#00000040]',
                isExpanded
                    ? 'w-[342px] gap-[69px]'
                    : 'w-[78px]'
            )}
            style={{
                background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.2) 0%, rgba(177, 162, 195, 0.2) 100%)',
            }}
        >
            {/* Toggle Button */}
            <button
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleMenu()
                }}
                type="button"
                className={cn(
                    "absolute z-50 flex items-center justify-center w-[16px] h-[16px] opacity-100 transition-all duration-300 cursor-pointer hover:opacity-80 pointer-events-auto bg-transparent border-none outline-none focus:outline-none",
                    isExpanded
                        ? "top-[47px] right-[305px] rotate-180"
                        : "top-[47px] right-[91px] "
                )}
                aria-label={isExpanded ? 'Collapse menu' : 'Expand menu'}
            >
                <div className="pointer-events-none flex items-center justify-center">
                    <ToggleMenuIcon width={16} height={16} />
                </div>
            </button>

        </aside>
    )
}
