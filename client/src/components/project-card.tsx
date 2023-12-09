import { timeString, toLocal } from "../lib/util"

interface PostData {
	username: string
	avatar: string
	description: string
	imageUrl?: string
	color: string,
	time: Date
}

export function ProjectCard({
	username,
	avatar,
	description,
	imageUrl,
	color,
	time
}: PostData) {
	return <div
		className="rounded-2xl bg-amber-600/25 w-full p-4 text-white mb-4 flex flex-col space-between"
		style={{ border: `8px solid ${color}` }}
	>
		<div className="flex flex-row items-center gap-x-2">
			<img className="w-10 rounded-full" src={avatar} />
			<h1 className="font-bold">{username}</h1>
		</div>
		<p className="mt-4">{description}</p>
		{imageUrl!==null ? <img src={imageUrl} className="mt-2 max-h-50 rounded" /> : <></>}
		<p className="text-sm text-gray-300" >{timeString(toLocal(time.getTime()))}</p>
	</div>;
}
