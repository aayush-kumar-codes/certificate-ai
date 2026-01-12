'use client'

import * as React from 'react'
import { Plus, Search, FolderKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ToggleMenuIcon, LeftMenuLogo, FileIcon } from '@/components/icons'

export function LeftMenu() {
    const [isExpanded, setIsExpanded] = React.useState(false)

    const toggleMenu = () => {
        setIsExpanded(!isExpanded)
    }

    return (
        <aside
            className={cn(
                'relative flex flex-col items-center transition-all duration-300 ease-in-out',
                'h-[974px] opacity-100 overflow-visible',
                isExpanded
                    ? 'w-[240px] gap-[69px]'
                    : 'w-[78px]'
            )}
            style={{
                background: 'linear-gradient(90deg, rgba(88, 132, 206, 0.2) 0%, rgba(177, 162, 195, 0.2) 100%)',
                boxShadow: '0px 4px 4px 0px #00000040',
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
                        ? "top-[47px] left-[207px] rotate-180"
                        : "top-[47px] left-[91px]"
                )}
                aria-label={isExpanded ? 'Collapse menu' : 'Expand menu'}
            >
                <div className="pointer-events-none flex items-center justify-center">
                    <ToggleMenuIcon width={16} height={16} />
                </div>
            </button>

            <div className="flex flex-col items-center w-full pt-6 space-y-6">
                {/* Logo */}
                <div className="absolute top-[32px] left-[19px] opacity-100">
                    <LeftMenuLogo
                        width={36}
                        height={43}
                        className="text-white"
                    />
                </div>

                {/* Divider Line */}
                <div
                    className={cn(
                        "absolute h-[0.5px] opacity-100 transition-all duration-300",
                        isExpanded
                            ? "top-[91px] w-[240px]"
                            : "top-[91px] w-[78px]"
                    )}
                    style={{
                        background: 'linear-gradient(90deg, rgba(232, 232, 225, 0.12) 50%, rgba(199, 181, 193, 0.12) 75%)',
                    }}
                />
                {/* Sessions Section */}
                <div>
                    <div
                        className="absolute top-[117px] left-[16px] opacity-100 w-[41px] h-[42px]"
                        style={{
                            padding: '0.567568px',
                            borderRadius: '5px',
                            background: 'linear-gradient(90deg, rgba(96, 82, 169, 0.2) 0%, rgba(232, 232, 225, 0.2) 50%, rgba(199, 181, 193, 0.2) 75%, rgba(153, 83, 107, 0.2) 100%)',
                        }}
                    >
                        <div
                            className="w-full h-full rounded flex items-center justify-center"
                            style={{
                                borderRadius: '4.71622px',
                                background: 'linear-gradient(90deg, rgba(232, 232, 225, 0.12) 50%, rgba(199, 181, 193, 0.12) 75%)',
                            }}
                        >
                            <Plus className="h-5 w-5 text-white" />
                        </div>
                    </div>

                    <span
                        className="absolute top-[172px] left-[10px] opacity-100 w-[52px] h-[18px] text-xs font-normal not-italic leading-none tracking-normal text-[#888888]"
                        style={{
                            fontFamily: 'var(--font-poppins), Poppins, sans-serif',
                        }}
                    >
                        Sessions
                    </span>
                </div>

                {/* Search Section */}
                <div
                    className="absolute top-[201px] left-[16px] opacity-100 p-[0.57px] rounded flex items-center justify-center w-[41px] h-[42px]"
                    style={{
                        background: 'linear-gradient(90deg, rgba(96, 82, 169, 0.2) 0%, rgba(232, 232, 225, 0.2) 50%, rgba(199, 181, 193, 0.2) 75%, rgba(153, 83, 107, 0.2) 100%)',
                    }}
                >
                    <div className="w-full h-full bg-transparent rounded flex items-center justify-center">
                        <Search className="w-[18px] h-[18px] text-white bg-transparent" />
                    </div>
                </div>

                {/* Second Divider Line with Gradient Border */}
                <div
                    className="absolute top-[275px] left-[15px] w-[42px] h-[0.5px] opacity-100"
                    style={{
                        background: 'linear-gradient(90deg, rgba(232, 232, 225, 0) 0%, rgba(232, 232, 225, 0.12) 62.5%, rgba(232, 232, 225, 0) 100%)',
                    }}
                />

                {/* File Icon Section */}
                <div className="opacity-100 w-[28.000001907348633px] h-[29px] bg-transparent">
                    {/* Number Badge */}
                    <div
                        className="absolute top-[295px] left-[34px] opacity-100 flex items-center justify-center text-[10px] font-semibold text-white w-[17.000001907348633px] h-[17.000001907348633px] bg-transparent"
                    >
                        7
                    </div>

                    {/* File Icon */}
                    <div className="absolute top-[308px] left-[23px] opacity-100 w-4 h-4 bg-transparent" style={{ background: 'var(--Transparent, #FFFFFF00)' }}>
                        <FileIcon width={16} height={16} />
                    </div>
                </div>

                {/* User Icon / Profile Picture */}
                <div className="absolute top-[903px] left-[20px] opacity-100 rounded-full overflow-hidden w-[33px] h-[33px] bg-transparent">
                    {/* Placeholder profile picture - replace with actual image */}
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center border-2 border-[#3a3a3a] rounded-full">
                        <img src="/demouser.jpg" alt="User" className="w-full h-full object-cover rounded-full" />
                       
                    </div>
                </div>


            </div>
        </aside>
    )
}
