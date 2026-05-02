const DEFAULT_GITHUB_USERNAME = "kleedaisuki";
const DEFAULT_REPO_LIMIT = 6;

export interface GitHubProfile {
    login: string;
    name: string | null;
    bio: string | null;
    avatar_url: string;
    html_url: string;
    followers: number;
    following: number;
    public_repos: number;
}

export interface GitHubRepo {
    name: string;
    html_url: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    fork: boolean;
    pushed_at: string;
}

export interface GitHubAboutData {
    username: string;
    profileUrl: string;
    profile: GitHubProfile | null;
    repos: GitHubRepo[];
}

function resolveGitHubUsername() {
    const fromEnv = import.meta.env.PUBLIC_GITHUB_USERNAME;
    if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
        return fromEnv.trim();
    }
    return DEFAULT_GITHUB_USERNAME;
}

function getGitHubRequestHeaders() {
    const token = import.meta.env.GITHUB_TOKEN || import.meta.env.GH_TOKEN;
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
    };
    if (typeof token === "string" && token.trim().length > 0) {
        headers.Authorization = `Bearer ${token.trim()}`;
    }
    return headers;
}

export async function getGitHubAboutData(
    repoLimit = DEFAULT_REPO_LIMIT,
): Promise<GitHubAboutData> {
    const username = resolveGitHubUsername();
    const profileUrl = `https://github.com/${username}`;
    const apiBase = `https://api.github.com/users/${username}`;

    let profile: GitHubProfile | null = null;
    let repos: GitHubRepo[] = [];

    try {
        const headers = getGitHubRequestHeaders();
        const [profileRes, reposRes] = await Promise.all([
            fetch(apiBase, { headers }),
            fetch(`${apiBase}/repos?sort=pushed&per_page=100`, { headers }),
        ]);

        if (profileRes.ok) {
            profile = (await profileRes.json()) as GitHubProfile;
        }

        if (reposRes.ok) {
            const allRepos = (await reposRes.json()) as GitHubRepo[];
            repos = allRepos
                .filter((repo) => !repo.fork)
                .sort(
                    (a, b) =>
                        new Date(b.pushed_at).getTime() -
                        new Date(a.pushed_at).getTime(),
                )
                .slice(0, repoLimit);
        }
    } catch (error) {
        console.error("Failed to fetch GitHub data:", error);
    }

    return {
        username,
        profileUrl,
        profile,
        repos,
    };
}
