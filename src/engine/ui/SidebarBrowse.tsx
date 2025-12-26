import { ChatIcon, HeartIcon, PlayIcon } from '@phosphor-icons/react'
import { PlayGradientIcon } from './Icons.tsx'

function BrowseItem() {
  return (
    <div className="flex flex-row px-3 py-2 border-b border-neutral-700 cursor-pointer hover:bg-neutral-900 gap-2 justify-between group">
      <div className="flex flex-col">
        <div className="flex flex-row gap-2">
          <div className="flex flex-col w-full">
            <span className="text-sm">stagas - Deep Shadows in the Dark</span>
            <span className="text-sm self-start text-neutral-500 font-normal">
              remix of: <span className="hover:text-white hover:font-thin">raver - Shadows</span>
            </span>
          </div>
        </div>
        <div className="flex flex-row self-start justify-center gap-2">
          <div className="text-neutral-500 font-[Space_Grotesk] flex flex-row items-center justify-center font-normal text-sm hover:text-white">
            <HeartIcon size={16} />
            <span className="relative top-[1.35px] left-[1px]">42</span>
          </div>
          <div className="text-neutral-500 font-[Space_Grotesk] flex flex-row items-center justify-center font-normal text-sm hover:text-white">
            <ChatIcon size={16} />
            <span className="relative top-[1.35px] left-[1px]">42</span>
          </div>
          <div className="text-neutral-500 font-normal">
            <span className="text-sm">2w</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center">
        <div className="block group-hover:hidden text-neutral-700">
          <PlayIcon weight="fill" size={24} />
        </div>
        <div className="hidden group-hover:block">
          <PlayGradientIcon size={24} />
        </div>
      </div>
    </div>
  )
}

export function SidebarBrowse() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 100 }, (_item, index) => <BrowseItem key={index} />)}
    </div>
  )
}
