'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { ToggleMenuIcon, LeftMenuLogo, CodeBranchIcon, DocumentSidebarIcon, ChartIcon, DashboardIcon } from '@/components/icons'

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

            {/* Icons Section - Vertically Centered */}
            <div className="absolute top-[218px] left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-12">
                {/* Top Icon - CodeBranchIcon */}
                <div className="opacity-100 w-[20px] h-[18px] bg-transparent">
                    <CodeBranchIcon width={20} height={18} />
                </div>

                {/* Second Icon - DocumentSidebarIcon */}
                <div className="opacity-100 w-[18px] h-[17px] bg-transparent">
                    <DocumentSidebarIcon width={18} height={17} />
                </div>

                {/* Third Icon - ChartIcon */}
                <div className="opacity-100 w-[18px] h-[18px] bg-transparent">
                    <ChartIcon width={18} height={18} />
                </div>

                {/* Bottom Icon - DashboardIcon */}
                <div className="opacity-100 w-[20px] h-[20px] bg-transparent">
                    <DashboardIcon width={20} height={20} />
                </div>
            </div>

        </aside>
    )
}
